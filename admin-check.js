document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('adminToken');
  
    if (!token) {
      window.location.href = 'admin-login.html';
    } else {
      fetch('http://localhost:3000/api/admin/protected', {
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
        localStorage.removeItem('adminToken');
        window.location.href = 'admin-login.html';
      });
    }
  });
  