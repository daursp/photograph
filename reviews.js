// отзывы
document.addEventListener('DOMContentLoaded', async () => {

    // эл-ты страницы
    const API = location.origin;
    const list = document.getElementById('reviewsList');
    const form = document.getElementById('reviewForm');

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));


    // загрузка опубл отзывов
    async function load() {

        try {
            const r = await fetch(API + '/api/reviews');
            const d = await r.json();

            list.innerHTML = d.reviews.length
                ? d.reviews.map(x => `
                    <article style="
                        padding: 22px 0;
                        border-bottom: 1px solid rgba(255,255,255,.1)
                    ">
                        <div style="
                            color: var(--accent);
                            font-size: 1.1rem
                        ">
                            ${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)}
                        </div>

                        <h3 style="font-weight:400; margin:8px 0">
                            ${esc(x.fullname)}
                        </h3>

                        <p style="
                            color: var(--gray-pale);
                            white-space: pre-wrap
                        ">
                            ${esc(x.text)}
                        </p>

                        <small style="color:var(--gray-light)">
                            ${x.service ? esc(x.service) + ' · ' : ''}
                            ${new Date(x.created_at).toLocaleDateString('ru-RU')}
                        </small>
                    </article>
                `).join('')
                : '<p style="color:var(--gray-pale)">Пока нет опубликованных отзывов. Вы можете стать первым!</p>';

        } catch {
            list.textContent = 'Не удалось загрузить отзывы. Проверьте, запущен ли сервер.';
        }
    }


    // первоначальная загрузка отзывов
    load();


    // отправка нов отзыва
    form?.addEventListener('submit', async e => {

        e.preventDefault();

        const token = sessionStorage.getItem('auth_token');
        const msg = document.getElementById('reviewMsg');

        if (!token) {
            msg.className = 'msg msg-error show';
            msg.textContent = 'Чтобы оставить отзыв, войдите в аккаунт или зарегистрируйтесь.';
            return;
        }

        try {

            const r = await fetch(API + '/api/reviews', {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },

                body: JSON.stringify({
                    rating: Number(document.getElementById('reviewRating').value),
                    text: document.getElementById('reviewText').value
                })
            });

            const d = await r.json();

            msg.className = 'msg ' + (d.ok ? 'msg-success' : 'msg-error') + ' show';

            msg.textContent = d.ok
                ? d.message
                : (d.error || 'Не удалось отправить отзыв');

            if (d.ok) {
                form.reset();
                await load();
            }

        } catch {
            msg.className = 'msg msg-error show';
            msg.textContent = 'Сервер недоступен';
        }
    });

});