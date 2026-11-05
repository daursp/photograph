document.addEventListener('DOMContentLoaded', async () => {

    //проверка токена и прав админки
    const token = sessionStorage.getItem('auth_token');
    const msg = document.getElementById('message');
    const app = document.getElementById('app');

    const headers = {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    };

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

    if (!token) {
        msg.textContent = 'Для входа используйте аккаунт администратора.';
        setTimeout(() => location.href = 'login.html?next=admin.html', 900);
        return;
    }

    try {

        const me = await fetch('/api/me', { headers });
        const md = await me.json();

        if (!me.ok || md.user.role !== 'admin') {
            throw Error('Доступ разрешён только администратору');
        }

        //получение статистики
        const overview = await fetch('/api/admin/overview', { headers })
            .then(r => r.json());

        if (!overview.ok) {
            throw Error(overview.error || 'Ошибка доступа');
        }

        msg.remove();
        app.hidden = false;

        const labels = {
            users: 'Пользователи',
            bookings: 'Заявки',
            reviews: 'Отзывы',
            subscribers: 'Подписки',
            contact_messages: 'Сообщения'
        };

        document.getElementById('stats').innerHTML =
            Object.entries(overview.stats).map(([k, v]) => `
                <div class="stat">
                    <span>${labels[k] || k}</span>
                    <strong>${v}</strong>
                </div>
            `).join('');


        //загрузка и отображение выбранного раздела
        async function show(tab) {

            //переключ вкладок и обработка действ
            document.querySelectorAll('[data-tab]').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === tab);
            });

            const titles = {
                bookings: 'Заявки клиентов',
                reviews: 'Модерация отзывов',
                users: 'Пользователи',
                messages: 'Сообщения с формы контактов',
                subscribers: 'Подписчики'
            };

            document.getElementById('tableTitle').textContent = titles[tab];

            const data = await fetch('/api/admin/' + tab, { headers })
                .then(r => r.json());

            if (!data.ok) {
                throw Error(data.error || 'Не удалось загрузить данные');
            }

            const rows = data[tab] || data.messages || data.subscribers || [];

            if (!rows.length) {
                document.getElementById('tableWrap').innerHTML =
                    '<p class="muted">Записей пока нет.</p>';
                return;
            }

            let cols = Object.keys(rows[0]).filter(k => !['user_id'].includes(k));

            let html =
                '<table><thead><tr>' +
                cols.map(c => `<th>${esc(c)}</th>`).join('') +
                '<th>Действие</th></tr></thead><tbody>';

            html += rows.map(row => `
                <tr>
                    ${cols.map(c => `
                        <td>
                            ${esc(row[c] instanceof Object ? JSON.stringify(row[c]) : row[c])}
                        </td>
                    `).join('')}

                    <td>
                        ${
                            tab === 'reviews'
                                ? `<button class="action"
                                    data-review="${row.id}"
                                    data-approved="${!row.is_approved}">
                                    ${row.is_approved ? 'Скрыть' : 'Одобрить'}
                                   </button>`
                                : ''
                        }

                        ${
                            tab === 'bookings'
                                ? `
                                    <select data-status="${row.id}">
                                        ${
                                            [
                                                ['new', 'Новая'],
                                                ['in_progress', 'В работе'],
                                                ['completed', 'Завершена'],
                                                ['cancelled', 'Отменена']
                                            ].map(([v, l]) => `
                                                <option value="${v}" ${v === row.status ? 'selected' : ''}>
                                                    ${l}
                                                </option>
                                            `).join('')
                                        }
                                    </select>

                                    <button class="action" data-booking="${row.id}">
                                        Сохранить
                                    </button>
                                `
                                : ''
                        }
                    </td>
                </tr>
            `).join('') + '</tbody></table>';

            document.getElementById('tableWrap').innerHTML = html;
        }


        //переключение вкладок
        document.querySelectorAll('[data-tab]').forEach(b => {
            b.addEventListener('click', () => show(b.dataset.tab));
        });


        //обработка действий в таблице
        document.getElementById('tableWrap').addEventListener('click', async e => {

            const rv = e.target.closest('[data-review]');
            const bk = e.target.closest('[data-booking]');

            try {

                if (rv) {
                    const r = await fetch(
                        '/api/admin/reviews/' + rv.dataset.review,
                        {
                            method: 'PATCH',
                            headers,
                            body: JSON.stringify({
                                is_approved: rv.dataset.approved === 'true'
                            })
                        }
                    );

                    const d = await r.json();

                    if (!r.ok) {
                        throw Error(d.error);
                    }

                    await show('reviews');
                }

                if (bk) {
                    const status = document.querySelector(
                        `[data-status="${bk.dataset.booking}"]`
                    ).value;

                    const r = await fetch(
                        '/api/admin/bookings/' + bk.dataset.booking,
                        {
                            method: 'PATCH',
                            headers,
                            body: JSON.stringify({ status })
                        }
                    );

                    const d = await r.json();

                    if (!r.ok) {
                        throw Error(d.error);
                    }

                    await show('bookings');
                }

            } catch (err) {
                alert(err.message);
            }
        });

        await show('bookings');

    } catch (e) {
        msg.textContent = e.message;
        sessionStorage.removeItem('auth_token');
    }

});