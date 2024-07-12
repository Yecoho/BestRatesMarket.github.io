const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { format } = require('date-fns');

const app = express();
const port = 3000;
const secretKey = 'anfZCEd3JNZC3oKGFZAYoNT1EEZoswFP'; // Секретный ключ из переменных окружения
const walletAddress = 'TWBZXMeWMcWLr4nYFLwXgdof3Lufag2k1b'; // Ваш кошелек для пополнения

if (!secretKey) {
  throw new Error('SECRET_KEY is not defined. Please set it in the .env file.');
}

// Middleware для проверки токена администратора
const authenticateAdminToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.redirect('/admin-login.html'); // Перенаправление на страницу авторизации
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      return res.redirect('/admin-login.html'); // Перенаправление на страницу авторизации
    }

    if (user.role !== 'admin') {
      return res.status(403).send({ message: 'Forbidden' });
    }

    req.user = user;
    next();
  });
};

// Обслуживание статических файлов, включая фавикон
app.use(express.static(path.join(__dirname)));

// Обработка корневого URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', authenticateAdminToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Создание и инициализация базы данных
const db = new sqlite3.Database('./database.sqlite'); // Создание постоянного хранилища

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    balance REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    orderSum TEXT,
    orderRate TEXT,
    orderStatus TEXT,
    orderAccount TEXT,
    orderDate TEXT,
    orderAction TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS currency_rate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate REAL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date DATE,
    totalOrders INTEGER DEFAULT 0,
    successfulOrders INTEGER DEFAULT 0,
    successAmount REAL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method_name TEXT,
    card_number TEXT,
    cardholder TEXT,
    user_id INTEGER,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Создание таблицы для хранения хэш-транзакций
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    hash TEXT UNIQUE,
    amount REAL,
    timestamp INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Установить начальное значение автоинкремента для orders
  db.run(`INSERT INTO sqlite_sequence (name, seq) VALUES ('orders', 257)`);

  // Добавление тестовых пользователей и админа
  const stmt = db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)');
  stmt.run('user1', 'pass1', 'user');
  stmt.run('user2', 'pass2', 'user');
  stmt.run('admin', 'adminpass', 'admin');
  stmt.finalize();
});

// Использование middleware для обработки JSON и CORS
app.use(bodyParser.json());
app.use(cors());

// Маршрут для авторизации
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    if (user) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, secretKey); // Удален параметр expiresIn
      res.status(200).send({ message: 'Login successful', token });
    } else {
      res.status(401).send({ message: 'Invalid username or password' });
    }
  });
});

// Middleware для проверки токена
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    console.log('Token required');
    return res.status(401).send({ message: 'Token required' });
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      console.log('Invalid token', err);
      return res.status(403).send({ message: 'Invalid token' });
    }

    req.user = user;
    next();
  });
};

// Маршрут для проверки авторизации администратора
app.get('/api/admin/protected', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden' });
  }
  res.status(200).send({ message: 'Admin authorized' });
});

// Пример защищенного маршрута
app.get('/api/protected', authenticateToken, (req, res) => {
  res.status(200).send({ message: `Hello, ${req.user.username}` });
});

// Маршрут для получения заказов для конкретного пользователя
app.get('/api/orders', authenticateToken, (req, res) => {
  db.all('SELECT * FROM orders WHERE user_id = ?', [req.user.id], (err, orders) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send(orders);
  });
});

// Маршрут для добавления заказа
app.post('/api/orders', authenticateToken, (req, res) => {
  const { orderSum, orderRate, orderStatus, orderAccount, orderDate, orderAction } = req.body;

  db.run(`INSERT INTO orders (user_id, orderSum, orderRate, orderStatus, orderAccount, orderDate, orderAction)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.user.id, orderSum, orderRate, orderStatus, orderAccount, orderDate, orderAction],
          function(err) {
            if (err) {
              return res.status(500).send({ message: 'Database error' });
            }

            const orderId = this.lastID;
            res.status(200).send({ message: 'Order added successfully', orderId });

            // Установить таймер для удаления заказа через 15 минут
            setTimeout(() => {
              db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
                if (err) {
                  console.error('Error deleting order after timeout:', err);
                }
              });
            }, 15 * 60 * 1000); // 15 минут в миллисекундах
          });
});

// Маршрут для добавления заказа из админ панели
app.post('/api/admin/orders', authenticateAdminToken, (req, res) => {
  const { username, orderSum, orderRate, orderStatus, orderAccount, orderDate } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    if (!user) {
      return res.status(400).send({ message: 'User not found' });
    }

    const rate = orderRate !== null ? orderRate : 90;

    db.run(`INSERT INTO orders (user_id, orderSum, orderRate, orderStatus, orderAccount, orderDate)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [user.id, orderSum, rate, orderStatus, orderAccount, orderDate],
            function(err) {
              if (err) {
                return res.status(500).send({ message: 'Database error' });
              }

              const orderId = this.lastID;
              res.status(200).send({ message: 'Order added successfully', orderId });

              // Установить таймер для удаления заказа через 15 минут
              setTimeout(() => {
                db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
                  if (err) {
                    console.error('Error deleting order after timeout:', err);
                  }
                });
              }, 15 * 60 * 1000); // 15 минут в миллисекундах
            });
  });
});

// Маршрут для получения всех заказов (для админ панели)
app.get('/api/admin/orders', authenticateAdminToken, (req, res) => {
  db.all('SELECT orders.*, users.username FROM orders JOIN users ON orders.user_id = users.id', (err, orders) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send(orders);
  });
});

// Маршрут для удаления заказа (для админ панели)
app.delete('/api/admin/orders/:id', authenticateAdminToken, (req, res) => {
  const orderId = req.params.id;

  db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }
    res.status(200).send({ message: 'Order deleted successfully' });
  });
});

// Маршрут для получения и обновления курса валюты
app.get('/api/currency', (req, res) => {
  db.get('SELECT rate FROM currency_rate ORDER BY updated_at DESC LIMIT 1', (err, row) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send({ rate: row ? row.rate : 90 });
  });
});

app.post('/api/admin/currency', authenticateAdminToken, (req, res) => {
  const { rate } = req.body;

  db.run('INSERT INTO currency_rate (rate) VALUES (?)', [rate], function(err) {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send({ message: 'Currency rate updated successfully', rate });
  });
});

// Маршрут для одобрения заказа
app.post('/api/orders/approve/:id', authenticateToken, (req, res) => {
  const orderId = req.params.id;

  db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    if (!order) {
      return res.status(404).send({ message: 'Order not found' });
    }

    const orderRate = parseFloat(order.orderRate);
    const orderDate = new Date(order.orderDate).toISOString().split('T')[0];

    db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, user) => {
      if (err) {
        return res.status(500).send({ message: 'Database error' });
      }

      if (user.balance < orderRate) {
        return res.status(400).send({ message: 'Insufficient balance' });
      }

      db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [orderRate, req.user.id], function(err) {
        if (err) {
          return res.status(500).send({ message: 'Database error' });
        }

        db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
          if (err) {
            return res.status(500).send({ message: 'Database error' });
          }

          // Обновление статистики
          db.get('SELECT * FROM statistics WHERE user_id = ? AND date = ?', [req.user.id, orderDate], (err, stat) => {
            if (err) {
              return res.status(500).send({ message: 'Database error' });
            }

            if (stat) {
              db.run(`UPDATE statistics
                      SET totalOrders = totalOrders + 1,
                          successfulOrders = successfulOrders + 1,
                          successAmount = successAmount + ?
                      WHERE user_id = ? AND date = ?`,
                      [orderRate, req.user.id, orderDate], function(err) {
                if (err) {
                  return res.status(500).send({ message: 'Database error' });
                }

                res.status(200).send({ message: 'Order approved and deleted successfully' });
              });
            } else {
              db.run(`INSERT INTO statistics (user_id, date, totalOrders, successfulOrders, successAmount)
                      VALUES (?, ?, 1, 1, ?)`,
                      [req.user.id, orderDate, orderRate], function(err) {
                if (err) {
                  return res.status(500).send({ message: 'Database error' });
                }

                res.status(200).send({ message: 'Order approved and deleted successfully' });
              });
            }
          });
        });
      });
    });
  });
});

// Маршрут для пополнения баланса
app.post('/api/balance', authenticateToken, (req, res) => {
  const { transactionHash } = req.body;

  if (!transactionHash) {
    console.log('Transaction hash required');
    return res.status(400).send({ message: 'Transaction hash required' });
  }

  // Проверка на повторное использование хэш транзакции
  db.get('SELECT * FROM transactions WHERE hash = ?', [transactionHash], (err, row) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    if (row) {
      return res.status(400).send({ message: 'Transaction hash already used' });
    }

    const config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `https://apilist.tronscanapi.com/api/transaction-info?hash=${transactionHash}`,
      headers: { }
    };

    axios.request(config)
      .then((response) => {
        const data = response.data;
        // console.log('Response data:', data);

        // Проверяем, что транзакция подтверждена и получаем сумму
        if (data.confirmed && data.trc20TransferInfo && data.trc20TransferInfo.length > 0) {
          const transfer = data.trc20TransferInfo.find(t => t.to_address === walletAddress);
          if (!transfer) {
            return res.status(400).send({ message: 'Transaction not to the specified wallet address' });
          }

          let amount = parseFloat(transfer.amount_str) / Math.pow(10, transfer.decimals);
          const bonus = amount * 0.05;
          let totalAmount = amount + bonus;
          totalAmount = Math.round(totalAmount * 100) / 100; // Округление до сотых

          console.log('Amount:', totalAmount);

          // Обновление баланса пользователя (предполагаем, что amount - это сумма в USDT)
          db.run('UPDATE users SET balance = ROUND(balance + ?, 2) WHERE id = ?', [totalAmount, req.user.id], function(err) {
            if (err) {
              console.log('Database error:', err);
              return res.status(500).send({ message: 'Database error' });
            }

            // Сохранение использованной хэш транзакции
            db.run('INSERT INTO transactions (user_id, hash, amount, timestamp) VALUES (?, ?, ?, ?)',
              [req.user.id, transactionHash, totalAmount, Date.now()], function(err) {
                if (err) {
                  console.log('Database error:', err);
                  return res.status(500).send({ message: 'Database error' });
                }

                res.status(200).send({ message: 'Balance updated successfully' });
              });
          });
        } else {
          res.status(400).send({ message: 'Transaction not confirmed or invalid' });
        }
      })
      .catch((error) => {
        console.log('Error fetching transaction info:', error);
        res.status(500).send({ message: 'Error fetching transaction info' });
      });
  });
});

// Маршрут для получения баланса пользователя
app.get('/api/balance', authenticateToken, (req, res) => {
  db.get('SELECT balance FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send({ balance: row ? row.balance : 0 });
  });
});

// Маршрут для получения статистики пользователя
app.get('/api/statistics', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      date,
      totalOrders,
      successfulOrders,
      successAmount
    FROM statistics
    WHERE user_id = ?
    ORDER BY date DESC
  `, [req.user.id], (err, rows) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }
    res.status(200).send(rows);
  });
});

// Маршрут для получения всех методов оплаты для конкретного пользователя
app.get('/api/payment_methods', authenticateToken, (req, res) => {
  db.all('SELECT id, method_name, card_number, cardholder, creation_date FROM payment_methods WHERE user_id = ?', [req.user.id], (err, methods) => {
    if (err) {
      console.error('Error fetching payment methods:', err);
      return res.status(500).send({ message: 'Database error' });
    }

    const formattedMethods = methods.map(method => ({
      ...method,
      creation_date: format(new Date(method.creation_date), 'yyyy-MM-dd HH:mm:ss')
    }));

    res.status(200).send(formattedMethods);
  });
});

// Маршрут для добавления нового метода оплаты
app.post('/api/payment_methods', authenticateToken, (req, res) => {
  const { method_name, card_number, cardholder } = req.body;
  const userId = req.user.id;

  const creationDate = new Date().toISOString();

  db.run('INSERT INTO payment_methods (method_name, card_number, cardholder, user_id, creation_date) VALUES (?, ?, ?, ?, ?)',
    [method_name, card_number, cardholder, userId, creationDate],
    function(err) {
      if (err) {
        console.error('Error inserting payment method:', err);
        return res.status(500).send({ message: 'Database error' });
      }

      res.status(200).send({ message: 'Method added successfully', id: this.lastID });
    });
});

// Маршрут для удаления метода оплаты
app.delete('/api/payment_methods/:id', authenticateToken, (req, res) => {
  const methodId = req.params.id;

  db.run('DELETE FROM payment_methods WHERE id = ? AND user_id = ?', [methodId, req.user.id], function(err) {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }
    res.status(200).send({ message: 'Payment method deleted successfully' });
  });
});

// Маршрут для получения всех карт (для админ панели)
app.get('/api/admin/cards', authenticateAdminToken, (req, res) => {
  db.all(`
    SELECT 
      pm.id, 
      pm.method_name, 
      pm.card_number, 
      pm.cardholder, 
      pm.creation_date, 
      u.username 
    FROM payment_methods pm
    JOIN users u ON pm.user_id = u.id
  `, (err, cards) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send(cards);
  });
});

app.patch('/api/admin/orders/:id', authenticateAdminToken, (req, res) => {
  const orderId = req.params.id;
  const { orderStatus } = req.body;

  db.run('UPDATE orders SET orderStatus = ? WHERE id = ?', [orderStatus, orderId], function(err) {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }
    res.status(200).send({ message: 'Order status updated successfully' });
  });
});

// Маршрут для получения всех пользователей (для отправки случайных заявок)
app.get('/api/users', authenticateAdminToken, (req, res) => {
  db.all('SELECT id, username, role FROM users', (err, users) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }
    res.status(200).send(users);
  });
});

// Маршрут для получения баланса пользователя по ID
app.get('/api/users/:id/balance', authenticateAdminToken, (req, res) => {
  const userId = req.params.id;

  db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, row) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send({ balance: row ? row.balance : 0 });
  });
});

// Маршрут для получения методов оплаты пользователя по ID (для админ панели)
app.get('/api/admin/users/:id/payment_methods', authenticateAdminToken, (req, res) => {
  const userId = req.params.id;

  db.all('SELECT card_number FROM payment_methods WHERE user_id = ?', [userId], (err, methods) => {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    res.status(200).send(methods);
  });
});

// Маршрут для отмены заказа
app.post('/api/orders/cancel/:id', authenticateToken, (req, res) => {
  const orderId = req.params.id;

  db.run('UPDATE orders SET orderStatus = ? WHERE id = ?', ['Cancelled', orderId], function(err) {
    if (err) {
      return res.status(500).send({ message: 'Database error' });
    }

    db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
      if (err) {
        return res.status(500).send({ message: 'Database error' });
      }
      res.status(200).send({ message: 'Order cancelled successfully' });
    });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
