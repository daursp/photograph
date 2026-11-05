document.addEventListener('DOMContentLoaded', async () => {

    // проверка токена и доступа
    const token = sessionStorage.getItem('auth_token');
    const status = document.getElementById('status');

    if (!token) {
        location.replace('login.html?next=account.html');
        return;
    }

    try {

        // запрос профиля, заявок и отзывов
        const r = await fetch('/api/me', {
            headers: {
                Authorization: 'Bearer ' + token
            }
        });

        const d = await r.json();

        if (!r.ok || !d.ok) {
            throw Error(d.error || 'Сессия истекла');
        }

        document.getElementById('content').hidden = false;
        status.remove();

        const u = d.user;

        document.getElementById('profile').textContent =
            `${u.fullname} · ${u.email} · ${u.phone || 'телефон не указан'} · Роль: ${u.role}`;

        if (u.role === 'admin') {
            document.getElementById('adminLink').innerHTML =
                '<a href="admin.html">Открыть панель администратора →</a>';
        }

        // безоп вывод данных на стр
        const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));

        document.getElementById('bookings').innerHTML =
            d.bookings.length
                ? d.bookings.map(b => `
                    <div class="item">
                        <b>${esc(b.shoot_type)}</b> — ${esc(b.status)}
                        <br>
                        <span class="muted">
                            ${b.booking_date
                                ? new Date(b.booking_date).toLocaleDateString('ru-RU')
                                : 'Дата не выбрана'}
                            ·
                            ${new Date(b.created_at).toLocaleDateString('ru-RU')}
                        </span>
                    </div>
                `).join('')
                : '<p class="muted">У вас пока нет заявок.</p>';

        document.getElementById('reviews').innerHTML =
            d.reviews.length
                ? d.reviews.map(v => `
                    <div class="item">
                        ${'★'.repeat(v.rating)}${'☆'.repeat(5 - v.rating)}
                        <p>${esc(v.text)}</p>
                        <span class="muted">
                            ${v.is_approved ? 'Опубликован' : 'Ожидает модерации'}
                        </span>
                    </div>
                `).join('')
                : '<p class="muted">Вы ещё не оставляли отзывы.</p>';

    } catch (e) {

        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('current_user');

        status.textContent = 'Не удалось проверить вход: ' + e.message;

        setTimeout(() => {
            location.replace('login.html?next=account.html');
        }, 1200);
    }

    // выход из акка
    document.getElementById('logout').addEventListener('click', () => {
        sessionStorage.clear();
        location.href = 'index.html';
    });

});