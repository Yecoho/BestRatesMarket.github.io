document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('order-form');
    
    form.addEventListener('submit', function(event) {
      event.preventDefault();
      
      const data = {
        username: form.username.value,
        orderSum: form.orderSum.value,
        orderRate: form.orderRate.value,
        orderStatus: form.orderStatus.value,
        orderAccount: form.orderAccount.value,
        orderDate: form.orderDate.value,
        orderAction: form.orderAction.value
      };
  
      fetch('http://localhost:3000/api/admin/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('token')
        },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(data => {
        console.log(data.message);
      })
      .catch(error => console.error('Error:', error));
    });
  });
  