document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');

  if (localStorage.getItem('token')) {
    window.location.href = 'index.html';
  }

  loginForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const username = loginForm.username.value.trim();
    const password = loginForm.password.value.trim();

    if (validateInput(username, password)) {
      fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          return response.json().then(data => {
            throw new Error(data.message);
          });
        }
      })
      .then(data => {
        localStorage.setItem('token', data.token);
        window.location.href = 'index.html';
      })
      .catch(error => {
        errorMessage.textContent = error.message;
      });
    } else {
      errorMessage.textContent = 'Invalid input';
    }
  });
});

function validateInput(username, password) {
  const usernamePattern = /^[a-zA-Z0-9_]{1,20}$/;
  const passwordPattern = /^[a-zA-Z0-9_@#%^&+=]{1,20}$/;

  return usernamePattern.test(username) && passwordPattern.test(password);
}
