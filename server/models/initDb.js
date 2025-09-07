// מריץ את init.sql על מסד PostgreSQL
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const sql = fs.readFileSync(path.join(__dirname, '../init.sql')).toString();

pool.query(sql)
  .then(() => {
    console.log('Database initialized!');
    process.exit(0);
  })
  .catch(err => {
    console.error('DB init error:', err);
    process.exit(1);
  });
