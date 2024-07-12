document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.querySelector('.menu__toggle');
    const menuList = document.querySelector('.menu__list');
    const overlay = document.querySelector('.overlay');

    toggleButton.addEventListener('click', function() {
        menuList.classList.toggle('menu__list--active');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', function() {
        menuList.classList.remove('menu__list--active');
        overlay.classList.remove('active');
    });
});
