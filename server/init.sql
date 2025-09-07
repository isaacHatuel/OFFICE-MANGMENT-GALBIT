-- יצירת טבלאות בסיסיות למערכת
CREATE TABLE IF NOT EXISTS workers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    logic VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50),
    client VARCHAR(100),
    project_name VARCHAR(100),
    board_name VARCHAR(100),
    quantity INTEGER,
    worker VARCHAR(100),
    status VARCHAR(50),
    neg1 VARCHAR(50),
    neg2 VARCHAR(50),
    neg3 VARCHAR(50),
    notes TEXT,
    treated BOOLEAN,
    delivered BOOLEAN,
    finished BOOLEAN,
    date DATE
);

CREATE TABLE IF NOT EXISTS journal (
    id SERIAL PRIMARY KEY,
    date DATE,
    client VARCHAR(100),
    project_name VARCHAR(100),
    board_name VARCHAR(100),
    col4 TEXT,
    col5 TEXT,
    col6 TEXT,
    col7 VARCHAR(100),
    col8 VARCHAR(100),
    col9 VARCHAR(100),
    col10 VARCHAR(100),
    col11 VARCHAR(100),
    col12 VARCHAR(100),
    col13 VARCHAR(100)
);
