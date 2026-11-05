require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { pool, initDb } = require('./db');


// созд и настройки

const app = express();
const BASE = __dirname;
const PORT = Number(process.env.PORT || 5000);

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_TTL_HOURS = Number(process.env.JWT_TTL_HOURS || 12);

if (JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET должен быть случайной строкой минимум 32 символа');
}

app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30kb' }));

app.use((req, res, next) => {
    res.setHeader(
        'Cache-Control',
        req.path.startsWith('/api/') ? 'no-store' : 'public, max-age=300'
    );

    next();
});

app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
}));

app.use('/api/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false
}));

app.use(express.static(BASE, {
    index: false,
    dotfiles: 'ignore'
}));


// вспом функции и форма ответов

const emailOk = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

const str = v => typeof v === 'string' ? v.trim() : '';

const publicUser = u => ({
    id: u.id,
    fullname: u.fullname,
    email: u.email,
    phone: u.phone || '',
    role: u.role
});

const fail = (res, status, error) =>
    res.status(status).json({ ok: false, error });

const asyncRoute = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function makeToken(user) {
    return jwt.sign(
        { sub: String(user.id) },
        JWT_SECRET,
        {
            algorithm: 'HS256',
            expiresIn: `${JWT_TTL_HOURS}h`
        }
    );
}

const userSelect = `
    SELECT
        u.id,
        u.fullname,
        u.email,
        u.phone,
        r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
`;

function auth(requiredRole) {
    return asyncRoute(async (req, res, next) => {
        const h = req.headers.authorization || '';

        if (!h.startsWith('Bearer ')) {
            return fail(res, 401, 'Требуется вход в аккаунт');
        }

        try {
            const payload = jwt.verify(
                h.slice(7),
                JWT_SECRET,
                { algorithms: ['HS256'] }
            );

            const q = await pool.query(
                `${userSelect} WHERE u.id = $1`,
                [Number(payload.sub)]
            );

            if (!q.rowCount) {
                return fail(res, 401, 'Сессия недействительна. Войдите снова.');
            }

            req.currentUser = q.rows[0];

            if (requiredRole && req.currentUser.role !== requiredRole) {
                return fail(res, 403, 'Недостаточно прав');
            }

            next();

        } catch {
            return fail(res, 401, 'Сессия недействительна или истекла. Войдите снова.');
        }
    });
}


//проверка сервера и базы

app.get('/api/health', asyncRoute(async (_req, res) => {
    await pool.query('SELECT 1');

    res.json({
        ok: true,
        database: 'MySQL Server'
    });
}));


// регистр вход и данные текущ польз

app.post('/api/register', asyncRoute(async (req, res) => {
    const fullname = str(req.body?.fullname);
    const email = str(req.body?.email).toLowerCase();
    const phone = str(req.body?.phone);
    const password = String(req.body?.password || '');

    if (fullname.length < 2 || fullname.length > 120 || !emailOk(email)) {
        return fail(res, 400, 'Укажите имя и корректный email');
    }

    if (password.length < 8 || password.length > 200) {
        return fail(res, 400, 'Пароль должен содержать не менее 8 символов');
    }

    const hash = await bcrypt.hash(password, 12);

    try {
        const q = await pool.query(
            `INSERT INTO users(fullname, email, phone, password_hash, role_id)
             VALUES($1, $2, $3, $4, (SELECT id FROM roles WHERE name = 'user'))
             RETURNING id`,
            [fullname, email, phone, hash]
        );

        const u = (
            await pool.query(
                `${userSelect} WHERE u.id = $1`,
                [q.rows[0].id]
            )
        ).rows[0];

        res.status(201).json({
            ok: true,
            user: publicUser(u),
            token: makeToken(u)
        });

    } catch (e) {
        if (e.code === '23505') {
            return fail(res, 409, 'Этот email уже зарегистрирован');
        }

        throw e;
    }
}));

app.post('/api/login', asyncRoute(async (req, res) => {
    const email = str(req.body?.email).toLowerCase();
    const password = String(req.body?.password || '');

    const q = await pool.query(
        `${userSelect.replace('u.phone,', 'u.phone, u.password_hash,')} WHERE u.email = $1`,
        [email]
    );

    const row = q.rows[0];

    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return fail(res, 401, 'Неверный email или пароль');
    }

    const u = publicUser(row);

    res.json({
        ok: true,
        user: u,
        token: makeToken(u)
    });
}));

app.get('/api/me', auth(), asyncRoute(async (req, res) => {
    const [b, r] = await Promise.all([
        pool.query(
            `SELECT id, shoot_type, status, booking_date, created_at
             FROM bookings
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.currentUser.id]
        ),

        pool.query(
            `SELECT id, rating, text, is_approved, created_at
             FROM reviews
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.currentUser.id]
        )
    ]);

    res.json({
        ok: true,
        user: publicUser(req.currentUser),
        bookings: b.rows,
        reviews: r.rows
    });
}));


// заявки на съемку

app.post('/api/bookings', auth(), asyncRoute(async (req, res) => {
    const d = req.body || {};

    const name = str(d.name) || req.currentUser.fullname;
    const email = (str(d.email) || req.currentUser.email).toLowerCase();
    const phone = str(d.phone) || req.currentUser.phone;

    const shoot = str(d.shoot_type) || str(d.type);
    const message = str(d.message);
    const date = str(d.date) || null;

    if (!name || !emailOk(email) || !phone || !shoot) {
        return fail(res, 400, 'Заполните имя, email, телефон и тип съёмки');
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return fail(res, 400, 'Выберите дату в календаре');
    }

    if (date) {
        const parsed = new Date(`${date}T00:00:00Z`);

        if (
            Number.isNaN(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date
        ) {
            return fail(res, 400, 'Укажите корректную дату');
        }
    }

    const q = await pool.query(
        `INSERT INTO bookings(
            user_id, name, email, phone, shoot_type,
            booking_date, duration, delivery, message
        )
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
            req.currentUser.id,
            name,
            email,
            phone,
            shoot,
            date,
            str(d.duration),
            str(d.delivery),
            message
        ]
    );

    res.status(201).json({
        ok: true,
        id: q.rows[0].id
    });
}));


//получение и отправка отзывов

app.get('/api/reviews', asyncRoute(async (_req, res) => {
    const q = await pool.query(`
        SELECT
            rv.id,
            rv.rating,
            rv.text,
            rv.created_at,
            u.fullname,
            s.title AS service
        FROM reviews rv
        JOIN users u ON u.id = rv.user_id
        LEFT JOIN services s ON s.id = rv.service_id
        WHERE rv.is_approved = TRUE
        ORDER BY rv.created_at DESC
        LIMIT 100
    `);

    res.json({
        ok: true,
        reviews: q.rows
    });
}));

app.post('/api/reviews', auth(), asyncRoute(async (req, res) => {
    const rating = Number(req.body?.rating);
    const text = str(req.body?.text);

    let serviceId = req.body?.service_id || null;

    if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        text.length < 3 ||
        text.length > 2000
    ) {
        return fail(
            res,
            400,
            'Выберите оценку от 1 до 5 и напишите отзыв (3–2000 символов)'
        );
    }

    if (serviceId !== null) {
        serviceId = Number(serviceId);

        if (!Number.isInteger(serviceId)) {
            return fail(res, 400, 'Некорректная услуга');
        }
    }

    const q = await pool.query(
        `INSERT INTO reviews(user_id, service_id, rating, text, is_approved)
         VALUES($1, $2, $3, $4, FALSE)
         RETURNING id`,
        [req.currentUser.id, serviceId, rating, text]
    );

    res.status(201).json({
        ok: true,
        id: q.rows[0].id,
        message: 'Спасибо! Ваш отзыв отправлен на проверку и появится на сайте после одобрения.'
    });
}));


//подписка и форм обратн связи

app.post('/api/subscribe', asyncRoute(async (req, res) => {
    const email = str(req.body?.email).toLowerCase();

    if (!emailOk(email)) {
        return fail(res, 400, 'Укажите корректный email');
    }

    try {
        const q = await pool.query(
            'INSERT INTO subscribers(email) VALUES($1) RETURNING id',
            [email]
        );

        res.status(201).json({
            ok: true,
            id: q.rows[0].id
        });

    } catch (e) {
        if (e.code === '23505') {
            return fail(res, 409, 'Email уже подписан');
        }

        throw e;
    }
}));

app.post('/api/contact', asyncRoute(async (req, res) => {
    const d = req.body || {};

    const name = str(d.name);
    const email = str(d.email).toLowerCase();
    const subject = str(d.subject);
    const message = str(d.message);

    if (
        name.length < 2 ||
        name.length > 120 ||
        !emailOk(email) ||
        message.length < 5
    ) {
        return fail(res, 400, 'Проверьте имя, email и сообщение');
    }

    let uid = null;
    const h = req.headers.authorization || '';

    if (h.startsWith('Bearer ')) {
        try {
            const p = jwt.verify(
                h.slice(7),
                JWT_SECRET,
                { algorithms: ['HS256'] }
            );

            const q = await pool.query(
                'SELECT id FROM users WHERE id = $1',
                [Number(p.sub)]
            );

            if (q.rowCount) {
                uid = q.rows[0].id;
            }

        } catch {}
    }

    const q = await pool.query(
        `INSERT INTO contact_messages(user_id, name, email, subject, message)
         VALUES($1, $2, $3, $4, $5)
         RETURNING id`,
        [uid, name, email, subject, message]
    );

    res.status(201).json({
        ok: true,
        id: q.rows[0].id
    });
}));


//админ панель

app.get('/api/admin/overview', auth('admin'), asyncRoute(async (_req, res) => {
    const stats = {};

    for (const t of ['users', 'bookings', 'reviews', 'subscribers', 'contact_messages']) {
        const q = await pool.query(
            `SELECT COUNT(*)::int AS count FROM ${t}`
        );

        stats[t] = q.rows[0].count;
    }

    res.json({
        ok: true,
        stats
    });
}));

app.get('/api/admin/users', auth('admin'), asyncRoute(async (_req, res) => {
    const q = await pool.query(`
        SELECT
            u.id,
            u.fullname,
            u.email,
            u.phone,
            r.name AS role,
            u.created_at
        FROM users u
        JOIN roles r ON r.id = u.role_id
        ORDER BY u.created_at DESC
    `);

    res.json({
        ok: true,
        users: q.rows
    });
}));

app.get('/api/admin/bookings', auth('admin'), asyncRoute(async (_req, res) => {
    const q = await pool.query(`
        SELECT
            id, user_id, name, email, phone, shoot_type,
            booking_date, duration, delivery, message,
            status, created_at
        FROM bookings
        ORDER BY created_at DESC
    `);

    res.json({
        ok: true,
        bookings: q.rows
    });
}));

app.patch('/api/admin/bookings/:id', auth('admin'), asyncRoute(async (req, res) => {
    const status = req.body?.status;

    if (!['new', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return fail(res, 400, 'Недопустимый статус');
    }

    const q = await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING id',
        [status, Number(req.params.id)]
    );

    if (!q.rowCount) {
        return fail(res, 404, 'Заявка не найдена');
    }

    res.json({ ok: true });
}));

app.get('/api/admin/reviews', auth('admin'), asyncRoute(async (_req, res) => {
    const q = await pool.query(`
        SELECT
            rv.id,
            rv.rating,
            rv.text,
            rv.is_approved,
            rv.created_at,
            u.fullname,
            u.email,
            s.title AS service
        FROM reviews rv
        JOIN users u ON u.id = rv.user_id
        LEFT JOIN services s ON s.id = rv.service_id
        ORDER BY rv.created_at DESC
    `);

    res.json({
        ok: true,
        reviews: q.rows
    });
}));

app.patch('/api/admin/reviews/:id', auth('admin'), asyncRoute(async (req, res) => {
    const a = req.body?.is_approved;

    if (typeof a !== 'boolean') {
        return fail(res, 400, 'is_approved должен быть boolean');
    }

    const q = await pool.query(
        'UPDATE reviews SET is_approved = $1 WHERE id = $2 RETURNING id',
        [a, Number(req.params.id)]
    );

    if (!q.rowCount) {
        return fail(res, 404, 'Отзыв не найден');
    }

    res.json({ ok: true });
}));

app.get('/api/admin/messages', auth('admin'), asyncRoute(async (_req, res) => {
    const q = await pool.query(
        `SELECT id, name, email, subject, message, status, created_at
         FROM contact_messages
         ORDER BY created_at DESC`
    );

    res.json({
        ok: true,
        messages: q.rows
    });
}));

app.get('/api/admin/subscribers', auth('admin'), asyncRoute(async (_req, res) => {
    const q = await pool.query(
        `SELECT id, email, subscribed_at
         FROM subscribers
         ORDER BY subscribed_at DESC`
    );

    res.json({
        ok: true,
        subscribers: q.rows
    });
}));


// гл стр, обработка ошибок и запуск

app.get('/', (_req, res) => {
    res.sendFile(path.join(BASE, 'index.html'));
});

app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
        return next(err);
    }

    if (err.code === '23503') {
        return fail(res, 400, 'Указанная запись не найдена');
    }

    if (err.code === '22007' || err.code === '22008') {
        return fail(res, 400, 'Некорректная дата');
    }

    res.status(500).json({
        ok: false,
        error: 'Внутренняя ошибка сервера'
    });
});

(async () => {
    try {
        await initDb();

        app.listen(PORT, () => {
            console.log(`PHOTOGRAPH запущен: http://127.0.0.1:${PORT}`);
        });

    } catch (e) {
        console.error('Не удалось запустить сервер:', e.message);
        process.exit(1);
    }
})();