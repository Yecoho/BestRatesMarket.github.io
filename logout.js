document.addEventListener('DOMContentLoaded', function() {
  const logoutButton = document.querySelector('.logout');

  if (logoutButton) {
    logoutButton.addEventListener('click', function() {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
    });
  }
});
