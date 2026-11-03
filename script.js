document.addEventListener('DOMContentLoaded', () => {
  const lazyImages = document.querySelectorAll('img[data-src]');

  if ('IntersectionObserver' in window) {
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.add('loaded');
          imgObserver.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });

    lazyImages.forEach(img => imgObserver.observe(img));

  } else {
    lazyImages.forEach(img => {
      img.src = img.dataset.src;
      img.classList.add('loaded');
    });
  }

  const reveals = document.querySelectorAll(
    '.reveal, .reveal-left, .reveal-right'
  );

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach(el => revealObserver.observe(el));

  const nav = document.querySelector('nav');

  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  const burger = document.querySelector('.burger');
  const navLinks = document.querySelector('.nav-links');

  let overlay = document.querySelector('.nav-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);
  }

  function toggleMenu() {
    if (!burger || !navLinks) return;

    const isOpen = navLinks.classList.contains('open');

    burger.classList.toggle('open');
    navLinks.classList.toggle('open');
    overlay.classList.toggle('open');

    document.body.style.overflow = isOpen ? '' : 'hidden';
  }

  if (burger && navLinks) {
    burger.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);

    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', toggleMenu);
    });
  }


  const currentPage = location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');

    if (href === currentPage) {
      a.classList.add('active');
    }
  });

  const parallaxBgs = document.querySelectorAll('.parallax-bg');

  if (parallaxBgs.length) {
    window.addEventListener('scroll', () => {
      const scrollY = window.pageYOffset;

      parallaxBgs.forEach(el => {
        const parent = el.parentElement;
        const rect = parent.getBoundingClientRect();
        const offset = rect.top + scrollY;
        const delta = (scrollY - offset) * 0.35;

        el.style.transform = `translateY(${delta}px)`;
      });
    }, { passive: true });
  }

  const colorBg = document.querySelector('.cursor-color-bg');

  if (colorBg && colorBg.parentElement) {

    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;

    let currentH = 0;
    let currentS = 0;
    let currentL = 5;

    let targetH = 0;
    let targetS = 0;
    let targetL = 5;

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function mapRange(val, inMin, inMax, outMin, outMax) {
      return ((val - inMin) / (inMax - inMin)) *
        (outMax - outMin) + outMin;
    }

    function animateBg() {
      currentH = lerp(currentH, targetH, 0.04);
      currentS = lerp(currentS, targetS, 0.04);
      currentL = lerp(currentL, targetL, 0.04);

      colorBg.style.background =
        `radial-gradient(ellipse 80% 70% at ${lastX}px ${lastY}px,
          hsl(${currentH}, ${currentS}%, ${currentL + 12}%) 0%,
          hsl(${currentH}, ${currentS * 0.5}%, ${currentL}%) 50%,
          #0a0a0a 100%)`;

      requestAnimationFrame(animateBg);
    }

    colorBg.parentElement.addEventListener('mousemove', (e) => {
      const rect = colorBg.parentElement.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const w = rect.width;
      const h = rect.height;

      lastX = e.clientX;
      lastY = e.clientY;

      targetH = mapRange(x, 0, w, 0, 30);
      targetS = mapRange(y, 0, h, 0, 18);

      const cx = w / 2;
      const cy = h / 2;

      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = Math.sqrt(cx ** 2 + cy ** 2);

      targetL = mapRange(dist, 0, maxDist, 10, 3);
    });

    colorBg.parentElement.addEventListener('mouseleave', () => {
      targetH = 0;
      targetS = 0;
      targetL = 5;
    });

    animateBg();
  }

  const API = location.origin;

  window.DB = {

    token() {
      return sessionStorage.getItem('auth_token') || '';
    },

    authHeaders() {
      const h = { 'Content-Type': 'application/json' };

      if (this.token()) {
        h.Authorization = 'Bearer ' + this.token();
      }

      return h;
    },

  
    async addUser(name, email, password) {
      try {
        const r = await fetch(`${API}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullname: name,
            email,
            phone: document.querySelector('#phone')?.value || '',
            password
          })
        });

        const data = await r.json();

        if (!data.ok) {
          return {
            ok: false,
            msg: data.error || 'Ошибка регистрации'
          };
        }

        sessionStorage.setItem('auth_token', data.token);
        sessionStorage.setItem('current_user', JSON.stringify(data.user));

        return { ok: true, user: data.user };

      } catch {
        return {
          ok: false,
          msg: 'Сервер недоступен. Запустите сервер и проверьте подключение к MySQL.'
        };
      }
    },

    async loginUser(email, password) {
      try {
        const r = await fetch(`${API}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await r.json();

        if (!data.ok) {
          return { ok: false, msg: data.error };
        }

        sessionStorage.setItem('auth_token', data.token);
        sessionStorage.setItem('current_user', JSON.stringify(data.user));

        return { ok: true, user: data.user };

      } catch {
        return { ok: false, msg: 'Сервер недоступен' };
      }
    },

    getCurrentUser() {
      try {
        const u = sessionStorage.getItem('current_user');
        return u ? JSON.parse(u) : null;
      } catch {
        return null;
      }
    },

    logout() {
      sessionStorage.removeItem('current_user');
      sessionStorage.removeItem('auth_token');
    },

    async addBooking(data) {
      try {
        const r = await fetch(`${API}/api/bookings`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email,
            phone: data.phone,
            shoot_type: data.type || data.shoot_type,
            date: data.date || '',
            duration: data.duration || '',
            delivery: data.delivery || '',
            message: data.message || ''
          })
        });

        const result = await r.json();

        return result.ok
          ? { ok: true, booking: result }
          : { ok: false, msg: result.error || 'Ошибка при отправке' };

      } catch {
        return { ok: false, msg: 'Сервер недоступен' };
      }
    }
  };


  function updateNavAuth() {
    const user = window.DB.getCurrentUser();
    const authContainer = document.querySelector('.nav-auth');

    if (!authContainer) return;

    if (user) {

      authContainer.innerHTML = `
        <span style="color:var(--gray-pale);font-size:0.8rem;">
          Привет, ${(user.fullname || user.name || 'пользователь').split(' ')[0]}
        </span>

        <a href="account.html" class="btn-nav" style="margin-right:10px;">
          Кабинет
        </a>

        ${user.role === 'admin'
          ? '<a href="admin.html" class="btn-nav">Админ</a>'
          : ''
        }

        <a href="#" class="btn-nav" id="logoutBtn"
          style="border:1px solid var(--gray-mid);padding:6px 16px;
          border-radius:2px;font-size:0.8rem;letter-spacing:1.5px;
          text-transform:uppercase;color:var(--gray-pale);
          text-decoration:none;transition:all 0.3s;">
          Выйти
        </a>
      `;

      document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();

        window.DB.logout();
        updateNavAuth();

        if (typeof onLogout === 'function') {
          onLogout();
        }
      });

    } else {

      authContainer.innerHTML = `
        <a href="login.html">Войти</a>
        <a href="register.html" class="btn-nav">Регистрация</a>
      `;
    }
  }

  updateNavAuth();


  function requireAuth(form, msgEl) {

    if (window.DB.getCurrentUser()) {
      return true;
    }

    if (!msgEl) return false;

    const page = location.pathname.split('/').pop() || 'index.html';

    msgEl.className = 'msg msg-error show';

    msgEl.innerHTML =
      'Только зарегистрированные пользователи могут отправлять заявки. ' +
      '<a href="login.html?next=' + encodeURIComponent(page) +
      '" style="color:var(--accent);text-decoration:underline;">Войти</a>' +
      ' или ' +
      '<a href="register.html" style="color:var(--accent);text-decoration:underline;">зарегистрироваться</a>.';

    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = false;
    }

    return false;
  }


  function showFieldError(input, msg) {

    if (!input) return;

    const parent = input.closest('.form-group') || input.parentNode;

    parent.querySelectorAll('.field-error').forEach(e => e.remove());

    input.classList.toggle('error', !!msg);

    if (msg) {
      const el = document.createElement('span');

      el.className = 'field-error';
      el.textContent = msg;

      parent.appendChild(el);
    }
  }


  function clearFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach(e => e.remove());
    form.querySelectorAll('.error').forEach(e => e.classList.remove('error'));
  }

  const bookingForm = document.getElementById('bookingForm');

  if (bookingForm) {

    bookingForm.addEventListener('submit', async (e) => {

      e.preventDefault();
      clearFieldErrors(bookingForm);

      const msgEl = document.getElementById('bookingMsg');

      if ((location.pathname.split('/').pop() || '') === 'contact.html') {

        const name = bookingForm.name.value.trim();
        const email = bookingForm.email.value.trim();
        const message = bookingForm.message.value.trim();
        const subject = bookingForm.type?.value || '';

        if (
          name.length < 2 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          message.length < 5
        ) {
          if (msgEl) {
            msgEl.className = 'msg msg-error show';
            msgEl.textContent =
              'Заполните имя, корректный email и сообщение (не менее 5 символов).';
          }

          return;
        }

        try {
          const r = await fetch(`${API}/api/contact`, {
            method: 'POST',
            headers: window.DB.authHeaders(),
            body: JSON.stringify({ name, email, subject, message })
          });

          const d = await r.json();

          if (!r.ok || !d.ok) {
            throw new Error(d.error || 'Не удалось отправить сообщение');
          }

          if (msgEl) {
            msgEl.className = 'msg msg-success show';
            msgEl.textContent = 'Сообщение отправлено! Спасибо.';
          }

          bookingForm.reset();

        } catch (err) {

          if (msgEl) {
            msgEl.className = 'msg msg-error show';
            msgEl.textContent = err.message || 'Сервер недоступен';
          }
        }

        return;
      }

      if (!requireAuth(bookingForm, msgEl)) return;

      const name = bookingForm.name.value.trim();
      const email = bookingForm.email.value.trim();
      const msg = bookingForm.message?.value.trim();

      let ok = true;

      if (!name || name.length < 2) {
        showFieldError(bookingForm.name, 'Минимум 2 символа');
        ok = false;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError(bookingForm.email, 'Некорректный email');
        ok = false;
      }

      if (!msg || msg.length < 10) {
        showFieldError(bookingForm.message, 'Минимум 10 символов');
        ok = false;
      }

      if (!ok) return;

      const result = await window.DB.addBooking({
        name,
        email,
        phone: bookingForm.phone?.value || '',
        type: bookingForm.type?.value || '',
        message: msg
      });

      if (result.ok && msgEl) {

        msgEl.className = 'msg msg-success show';
        msgEl.textContent =
          'Заявка отправлена! Мы свяжемся с вами в ближайшее время.';

        bookingForm.reset();

      } else if (msgEl) {

        msgEl.className = 'msg msg-error show';
        msgEl.textContent =
          result.msg || 'Ошибка при отправке. Попробуйте позже.';
      }
    });
  }


  const bookingRequestForm = document.getElementById('bookingRequestForm');

  if (bookingRequestForm) {

    bookingRequestForm.addEventListener('submit', async (e) => {

      e.preventDefault();
      clearFieldErrors(bookingRequestForm);

      const msgEl = document.getElementById('bookingFormMsg');

      if (!requireAuth(bookingRequestForm, msgEl)) return;

      const name = bookingRequestForm.name.value.trim();
      const email = bookingRequestForm.email.value.trim();
      const phone = bookingRequestForm.phone?.value.trim() || '';
      const shootType = bookingRequestForm.shootType?.value || '';

      const delivery = bookingRequestForm.querySelector(
        'input[name="delivery"]:checked'
      );

      const message = bookingRequestForm.message?.value.trim() || '';

      let ok = true;

      if (!name || name.length < 2) {
        showFieldError(bookingRequestForm.name, 'Минимум 2 символа');
        ok = false;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError(bookingRequestForm.email, 'Некорректный email');
        ok = false;
      }

      if (!phone || phone.length < 7) {
        showFieldError(bookingRequestForm.phone, 'Введите телефон');
        ok = false;
      }

      if (!shootType) {
        showFieldError(bookingRequestForm.shootType, 'Выберите тип съёмки');
        ok = false;
      }

      if (!delivery) {
        showFieldError(
          bookingRequestForm.querySelector('input[name="delivery"]'),
          'Выберите способ получения'
        );

        ok = false;
      }

      if (!ok) return;


      const dateText = bookingRequestForm.date?.value.trim() || '';

      let dateForDatabase = '';

      if (dateText) {

        const match = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

        if (!match) {
          showFieldError(
            bookingRequestForm.date,
            'Введите дату в формате 20.09.2026'
          );

          return;
        }

        const [, day, month, year] = match;

        const candidate = `${year}-${month}-${day}`;

        const parsedDate = new Date(`${candidate}T00:00:00Z`);

        if (
          Number.isNaN(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== candidate
        ) {

          showFieldError(
            bookingRequestForm.date,
            'Введите существующую дату'
          );

          return;
        }

        dateForDatabase = candidate;
      }

      const submitButton = bookingRequestForm.querySelector(
        'button[type="submit"]'
      );

      if (bookingRequestForm.dataset.submitting === 'true') {
        return;
      }

      bookingRequestForm.dataset.submitting = 'true';

      if (submitButton) {
        submitButton.disabled = true;
      }

      let result;

      try {

        result = await window.DB.addBooking({
          name,
          email,
          phone,
          shoot_type: shootType,
          delivery: delivery.value,
          date: dateForDatabase,
          duration: bookingRequestForm.duration?.value || '',
          message
        });

      } catch (error) {

        result = {
          ok: false,
          msg: 'Не удалось отправить заявку. Попробуйте позже.'
        };

      } finally {

        bookingRequestForm.dataset.submitting = 'false';

        if (submitButton) {
          submitButton.disabled = false;
        }
      }

      if (result.ok) {

        document.getElementById('successModal')?.classList.add('open');

        bookingRequestForm.reset();

        if (msgEl) {
          msgEl.className = 'msg';
          msgEl.textContent = '';
        }

      } else if (msgEl) {

        msgEl.className = 'msg msg-error show';

        msgEl.textContent =
          result.msg || 'Ошибка при отправке. Попробуйте позже.';
      }
    });

    document.getElementById('closeModalBtn')?.addEventListener('click', () => {
      document.getElementById('successModal')?.classList.remove('open');
    });
  }

  const loginForm = document.getElementById('loginForm');

  if (loginForm) {

    loginForm.addEventListener('submit', async (e) => {

      e.preventDefault();
      clearFieldErrors(loginForm);

      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;

      let ok = true;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError(loginForm.email, 'Некорректный email');
        ok = false;
      }


      if (!password) {
        showFieldError(loginForm.password, 'Введите пароль');
        ok = false;
      }

      if (!ok) return;

      const result = await window.DB.loginUser(email, password);

      const msgEl = document.getElementById('loginMsg');

      if (!result.ok) {

        msgEl.className = 'msg msg-error show';
        msgEl.textContent = result.msg;

      } else {

        msgEl.className = 'msg msg-success show';
        msgEl.textContent = 'Вход выполнен! Перенаправление...';

        const next =
          new URLSearchParams(location.search).get('next') || 'index.html';

        setTimeout(() => {
          location.href = next;
        }, 1000);
      }
    });
  }

  const registerForm = document.getElementById('registerForm');

  if (registerForm) {

    registerForm.addEventListener('submit', async (e) => {

      e.preventDefault();
      clearFieldErrors(registerForm);

      const name = registerForm.fullname.value.trim();
      const email = registerForm.email.value.trim();
      const pwd = registerForm.password.value;
      const pwd2 = registerForm.password2.value;

      let ok = true;

      if (!name || name.length < 2) {
        showFieldError(registerForm.fullname, 'Минимум 2 символа');
        ok = false;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError(registerForm.email, 'Некорректный email');
        ok = false;
      }

      if (!pwd || pwd.length < 8) {
        showFieldError(registerForm.password, 'Минимум 8 символов');
        ok = false;
      }

      if (pwd !== pwd2) {
        showFieldError(registerForm.password2, 'Пароли не совпадают');
        ok = false;
      }

      if (!ok) return;

      const result = await window.DB.addUser(name, email, pwd);

      const msgEl = document.getElementById('registerMsg');

      if (!result.ok) {

        msgEl.className = 'msg msg-error show';
        msgEl.textContent = result.msg;

      } else {

        sessionStorage.setItem(
          'current_user',
          JSON.stringify(result.user)
        );

        msgEl.className = 'msg msg-success show';
        msgEl.textContent = 'Аккаунт создан! Перенаправление...';

        setTimeout(() => {
          location.href = 'index.html';
        }, 1000);
      }
    });
  }

  const counters = document.querySelectorAll('.counter');

  if (counters.length) {

    const counterObserver = new IntersectionObserver((entries) => {

      entries.forEach(entry => {

        if (entry.isIntersecting) {

          const el = entry.target;
          const target = parseInt(el.dataset.target);

          let current = 0;

          const step = Math.ceil(target / 50);

          const interval = setInterval(() => {

            current += step;

            if (current >= target) {
              current = target;
              clearInterval(interval);
            }

            el.textContent = current + (el.dataset.suffix || '');

          }, 30);

          counterObserver.unobserve(el);
        }
      });

    }, { threshold: 0.5 });

    counters.forEach(el => counterObserver.observe(el));
  }

});


(function () {

  (function () {

    const heroSection = document.getElementById('heroSection');
    const heroBg = document.getElementById('heroParallaxBg');

    if (!heroSection || !heroBg) return;

    let currentTranslateY = 0;
    let targetTranslateY = 0;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function updateHeroParallax() {

      const rect = heroSection.getBoundingClientRect();
      const scrollY = window.pageYOffset;

      const sectionTopAbs = rect.top + scrollY;
      const sectionHeight = heroSection.offsetHeight;

      let progress = 0;

      if (
        scrollY >= sectionTopAbs &&
        scrollY <= sectionTopAbs + sectionHeight
      ) {
        progress = (scrollY - sectionTopAbs) / sectionHeight;

      } else if (scrollY > sectionTopAbs + sectionHeight) {
        progress = 1;
      }

      progress = easeOutCubic(progress);

      targetTranslateY = progress * 80;
    }

    function smoothHeroAnimation() {

      currentTranslateY +=
        (targetTranslateY - currentTranslateY) * 0.08;

      heroBg.style.transform = `translateY(${currentTranslateY}px)`;

      requestAnimationFrame(smoothHeroAnimation);
    }

    smoothHeroAnimation();

    let ticking = false;

    window.addEventListener('scroll', () => {

      if (!ticking) {

        requestAnimationFrame(() => {
          updateHeroParallax();
          ticking = false;
        });

        ticking = true;
      }
    });

    window.addEventListener('resize', updateHeroParallax);

    updateHeroParallax();

  })();


  (function () {

    const parallaxSection = document.getElementById('parallaxSection');
    const parallaxBg = document.getElementById('parallaxBg');

    if (!parallaxSection || !parallaxBg) return;

    let currentTranslateY = 0;
    let targetTranslateY = 0;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function updateParallax() {

      const rect = parallaxSection.getBoundingClientRect();
      const scrollY = window.pageYOffset;

      const sectionTopAbs = rect.top + scrollY;
      const sectionHeight = parallaxSection.offsetHeight;

      let progress = 0;

      if (
        scrollY >= sectionTopAbs &&
        scrollY <= sectionTopAbs + sectionHeight
      ) {
        progress = (scrollY - sectionTopAbs) / sectionHeight;

      } else if (scrollY > sectionTopAbs + sectionHeight) {
        progress = 1;
      }

      progress = easeOutCubic(progress);

      targetTranslateY = progress * 100;
    }

    function smoothAnimation() {

      currentTranslateY +=
        (targetTranslateY - currentTranslateY) * 0.08;

      parallaxBg.style.transform = `translateY(${currentTranslateY}px)`;

      requestAnimationFrame(smoothAnimation);
    }

    smoothAnimation();

    let ticking = false;

    window.addEventListener('scroll', () => {

      if (!ticking) {

        requestAnimationFrame(() => {
          updateParallax();
          ticking = false;
        });

        ticking = true;
      }
    });

    window.addEventListener('resize', updateParallax);

    updateParallax();

  })();


  (function () {

    const glow = document.getElementById('pageCursorGlow');

    if (!glow) return;

    document.addEventListener('mousemove', (e) => {

      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;

      glow.style.background =
        `radial-gradient(1000px circle at ${x}% ${y}%,
        rgba(200,184,154,0.22), transparent 70%)`;
    });

    document.addEventListener('mouseleave', () => {

      glow.style.background =
        'radial-gradient(1000px circle at 50% 50%, rgba(200,184,154,0.22), transparent 70%)';
    });

  })();

})();


(function () {

  const skillFills = document.querySelectorAll('.skill-fill');

  if (!skillFills.length) return;

  const skillObserver = new IntersectionObserver((entries) => {

    entries.forEach(entry => {

      if (entry.isIntersecting) {

        entry.target.classList.add('animate');

        skillObserver.unobserve(entry.target);
      }
    });

  }, { threshold: 0.3 });

  skillFills.forEach(el => skillObserver.observe(el));

})();


(function () {

  document.querySelectorAll('.filter-btn').forEach(btn => {

    btn.addEventListener('click', () => {

      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
      });

      btn.classList.add('active');

      const filter = btn.dataset.filter;

      document.querySelectorAll('.gallery-item').forEach(item => {

        if (filter === 'all' || item.dataset.cat === filter) {
          item.classList.remove('hidden');

        } else {
          item.classList.add('hidden');
        }
      });
    });
  });


  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');

  if (lightbox && lightboxImg) {

    document.querySelectorAll('.gallery-item').forEach(item => {

      item.addEventListener('click', () => {

        const img = item.querySelector('img');

        if (!img) return;

        lightboxImg.src = img.dataset.src || img.src;

        lightbox.classList.add('open');
      });
    });

    // Закрытие по кнопке.
    lightboxClose?.addEventListener('click', () => {
      lightbox.classList.remove('open');
    });

    // Закрытие при нажатии за пределами изображения.
    lightbox.addEventListener('click', (e) => {

      if (e.target === lightbox) {
        lightbox.classList.remove('open');
      }
    });
  }


  (function () {

    const parallaxSection = document.getElementById('parallaxSection');
    const parallaxBg = document.getElementById('parallaxBg');

    if (!parallaxSection || !parallaxBg) return;

    let currentTranslateY = 0;
    let targetTranslateY = 0;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function updateParallax() {

      const rect = parallaxSection.getBoundingClientRect();
      const scrollY = window.pageYOffset;

      const sectionTopAbs = rect.top + scrollY;
      const sectionHeight = parallaxSection.offsetHeight;
      const windowHeight = window.innerHeight;

      let progress = 0;

      if (rect.top < windowHeight && rect.bottom > 0) {

        const visibleStart = Math.max(0, rect.top);
        const visibleEnd = Math.min(windowHeight, rect.bottom);

        const visibleHeight = visibleEnd - visibleStart;
        const visibleProgress = visibleHeight / windowHeight;

        if (
          scrollY >= sectionTopAbs &&
          scrollY <= sectionTopAbs + sectionHeight
        ) {
          progress = (scrollY - sectionTopAbs) / sectionHeight;

        } else if (scrollY < sectionTopAbs) {
          progress = 0;

        } else if (scrollY > sectionTopAbs + sectionHeight) {
          progress = 1;
        }

        progress = easeOutCubic(progress);

      } else if (scrollY > sectionTopAbs + sectionHeight) {
        progress = 1;
      }

      targetTranslateY = progress * 100;
    }

    function smoothAnimation() {

      currentTranslateY +=
        (targetTranslateY - currentTranslateY) * 0.08;

      parallaxBg.style.transform = `translateY(${currentTranslateY}px)`;

      requestAnimationFrame(smoothAnimation);
    }

    smoothAnimation();

    let ticking = false;

    window.addEventListener('scroll', () => {

      if (!ticking) {

        requestAnimationFrame(() => {
          updateParallax();
          ticking = false;
        });

        ticking = true;
      }
    });

    window.addEventListener('resize', updateParallax);

    updateParallax();

  })();

})();


(function () {

  document.querySelectorAll('.faq-question').forEach(btn => {

    btn.addEventListener('click', () => {

      const item = btn.parentElement;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('open');
      });

      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

})();


(function () {

  const subscribeBtn = document.getElementById('subscribeBtn');

  if (!subscribeBtn) return;

  subscribeBtn.addEventListener('click', async function () {

    const input = document.getElementById('newsletterEmail');
    const email = input?.value.trim();

    if (!email) return;

    try {

      const r = await fetch(location.origin + '/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await r.json();

      if (data.ok) {

        this.textContent = 'Подписан!';
        this.style.background = 'var(--accent)';

        input.value = '';

      } else {

        alert(data.error || 'Ошибка подписки');
      }

    } catch {

      alert('Не удалось связаться с сервером. Попробуйте позже.');
    }
  });

})();


(function () {

  const passwordInput = document.getElementById('password');
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');

  function checkPasswordStrength(password) {

    let strength = 0;
    let message = '';
    let color = '';

    if (password.length === 0) {

      message = '';
      color = 'transparent';
      strength = 0;

    } else if (password.length < 6) {

      message = 'Слишком короткий';
      color = '#e88';
      strength = 25;

    } else {

      if (password.length >= 8) strength += 25;
      if (password.match(/[a-z]/)) strength += 25;
      if (password.match(/[A-Z]/)) strength += 25;
      if (password.match(/[0-9]/)) strength += 25;
      if (password.match(/[^a-zA-Z0-9]/)) strength += 25;

      strength = Math.min(strength, 100);

      if (strength < 40) {

        message = 'Слабый';
        color = '#e88';

      } else if (strength < 70) {

        message = 'Средний';
        color = '#eda';

      } else {

        message = 'Сильный';
        color = '#8d8';
      }
    }

    if (strengthFill) {
      strengthFill.style.width = strength + '%';
      strengthFill.style.background = color;
    }

    if (strengthText) {
      strengthText.textContent = message;
      strengthText.style.color = color;
    }
  }

  if (passwordInput) {

    passwordInput.addEventListener('input', (e) => {
      checkPasswordStrength(e.target.value);
    });
  }

  const phoneInput = document.getElementById('phone');

  if (phoneInput) {

    phoneInput.addEventListener('input', (e) => {

      let value = e.target.value.replace(/[^\d+]/g, '');

      if (value && !value.startsWith('+')) {
        value = '+' + value;
      }

      e.target.value = value;
    });
  }

})();
