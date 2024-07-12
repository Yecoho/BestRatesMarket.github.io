document.addEventListener('DOMContentLoaded', function() {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'login.html';
  } else {
    fetch('http://localhost:3000/api/protected', {
      method: 'GET',
      headers: {
        'Authorization': token
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Unauthorized');
      }
    })
    .catch(() => {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
    });
  }
});
