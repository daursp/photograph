const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');


// проверка переменных окружения
if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error('Задайте DB_HOST, DB_NAME, DB_USER и DB_PASSWORD в .env');
}


//подключения msql
const rawPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',

    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
});


// параметры и совместимость запросов
const pool = {

    async query(sql, params = []) {

        const returning = /\s+RETURNING\s+id\s*;?\s*$/i.test(sql);

        sql = sql
            .replace(/\s+RETURNING\s+id\s*;?\s*$/i, '')
            .replace(/COUNT\s*\(\s*\*\s*\)::int/gi, 'COUNT(*)');

        const ordered = [];

        sql = sql.replace(/\$(\d+)/g, (_m, n) => {
            ordered.push(params[Number(n) - 1]);
            return '?';
        });

        try {

            const [result] = await rawPool.execute(sql, ordered);

            if (Array.isArray(result)) {
                return {
                    rows: result,
                    rowCount: result.length
                };
            }

            const rows = returning && result.insertId
                ? [{ id: result.insertId }]
                : (
                    returning && /^\s*UPDATE/i.test(sql) && result.affectedRows
                        ? [{ id: params[params.length - 1] }]
                        : []
                );

            return {
                rows,
                rowCount: result.affectedRows || 0,
                insertId: result.insertId
            };

        } catch (e) {

            if (e.code === 'ER_DUP_ENTRY') {
                e.code = '23505';
            }

            if (
                e.code === 'ER_NO_REFERENCED_ROW_2' ||
                e.code === 'ER_ROW_IS_REFERENCED_2'
            ) {
                e.code = '23503';
            }

            if (
                e.code === 'ER_TRUNCATED_WRONG_VALUE' ||
                e.code === 'ER_WRONG_VALUE'
            ) {
                e.code = '22007';
            }

            throw e;
        }
    }
};


// созд таблиц нач данных
async function initDb() {

    const statements = [

        // таблица ролей пользователей
        `CREATE TABLE IF NOT EXISTS roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(20) NOT NULL UNIQUE,
            CHECK (name IN ('user','admin'))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // таблица пользователей
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fullname VARCHAR(120) NOT NULL,
            email VARCHAR(254) NOT NULL UNIQUE,
            phone VARCHAR(40) NOT NULL DEFAULT '',
            password_hash VARCHAR(255) NOT NULL,
            role_id INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(role_id) REFERENCES roles(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // таблица услуг
        `CREATE TABLE IF NOT EXISTS services (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(160) NOT NULL,
            description TEXT NOT NULL,
            price DECIMAL(10,2) NOT NULL DEFAULT 0,
            images TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // таблица заявок
        `CREATE TABLE IF NOT EXISTS bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(254) NOT NULL,
            phone VARCHAR(40) NOT NULL DEFAULT '',
            shoot_type VARCHAR(160) NOT NULL,
            booking_date DATE NULL,
            duration VARCHAR(80) NOT NULL DEFAULT '',
            delivery VARCHAR(80) NOT NULL DEFAULT '',
            message TEXT NOT NULL,
            status ENUM('new','in_progress','completed','cancelled') NOT NULL DEFAULT 'new',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // таблица отзывов
        `CREATE TABLE IF NOT EXISTS reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            service_id INT NULL,
            rating TINYINT NOT NULL,
            text TEXT NOT NULL,
            is_approved BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK(rating BETWEEN 1 AND 5),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(service_id) REFERENCES services(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // таблица подписчиков
        `CREATE TABLE IF NOT EXISTS subscribers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(254) NOT NULL UNIQUE,
            subscribed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // таблица сообщений с формы контактов
        `CREATE TABLE IF NOT EXISTS contact_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(254) NOT NULL,
            subject VARCHAR(200) NOT NULL DEFAULT '',
            message TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ];


    // создание таблиц в базе данных
    for (const sql of statements) {
        await rawPool.execute(sql);
    }

    await rawPool.execute(
        "INSERT IGNORE INTO roles(name) VALUES ('user'),('admin')"
    );


    // проверка наличия услуг в базе данных
    const [svc] = await rawPool.execute(
        'SELECT COUNT(*) AS n FROM services'
    );

    if (Number(svc[0].n) === 0) {

        // добавление начальных услуг
        await rawPool.execute(`
            INSERT INTO services(title, description, price, images)
            VALUES
                ('Портретная съёмка', 'Индивидуальная портретная фотосессия', 100, ''),
                ('Love Story', 'Романтическая съёмка для пары', 150, ''),
                ('Семейная съёмка', 'Тёплая семейная фотосессия', 180, ''),
                ('Событие', 'Репортажная съёмка мероприятия', 200, '')
        `);
    }


    // получение данных администратора из .env
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';

    if (email && password) {

        if (password.length < 12) {
            throw new Error('ADMIN_PASSWORD должен быть не короче 12 символов');
        }

        const [existing] = await rawPool.execute(
            'SELECT id, password_hash FROM users WHERE email=?',
            [email]
        );

        const [role] = await rawPool.execute(
            "SELECT id FROM roles WHERE name='admin'"
        );


        if (existing.length) {

            // обновляем пароль только если он отличается от значения в .env.
            const passwordMatches = await bcrypt.compare(
                password,
                existing[0].password_hash
            );

            if (!passwordMatches) {

                const hash = await bcrypt.hash(password, 12);

                await rawPool.execute(
                    'UPDATE users SET password_hash=?, role_id=? WHERE id=?',
                    [hash, role[0].id, existing[0].id]
                );

            } else {

                await rawPool.execute(
                    'UPDATE users SET role_id=? WHERE id=?',
                    [role[0].id, existing[0].id]
                );
            }

        } else {

            const hash = await bcrypt.hash(password, 12);

            await rawPool.execute(
                'INSERT INTO users(fullname, email, password_hash, role_id) VALUES(?,?,?,?)',
                ['Администратор', email, hash, role[0].id]
            );
        }
    }
}


// экспорт функций и подключений
module.exports = {
    pool,
    initDb
};