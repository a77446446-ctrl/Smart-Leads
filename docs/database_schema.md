# Database Schema (PostgreSQL)

## Tables

### users
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| telegram_id | BIGINT (UQ) | Unique TG User ID |
| name | VARCHAR | Display Name |
| role | ENUM('user', 'admin') | Access Level |
| balance | DECIMAL | Current balance in RUB |
| rating | FLOAT | User rating |
| created_at | TIMESTAMP | Creation time |

### categories
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| name | VARCHAR | Human readable name |
| slug | VARCHAR (UQ) | URL friendly name |
| payment_mode | ENUM('lead', 'sub', 'hybrid')| Monetization type |
| lead_price | DECIMAL | Price per single lead |
| subscription_price | DECIMAL | Price for 30 days |
| days | INT | Subscription duration (default 30) |
| active | BOOLEAN | Status |

### subscriptions
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| user_id | UUID (FK) | Reference to users |
| category_id | UUID (FK) | Reference to categories |
| expires_at | TIMESTAMP | Expiration date |

### leads
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| title | VARCHAR | AI generated title |
| raw_text | TEXT | Original message |
| phone | VARCHAR | Customer contact |
| city | VARCHAR | Detected location |
| category_id | UUID (FK) | Reference to categories |
| score | INT | AI Quality score (0-100) |
| price | DECIMAL | Current price |
| status | ENUM('new', 'sold', 'archived')| Lead status |
| created_at | TIMESTAMP | Creation time |

### purchases
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| user_id | UUID (FK) | Reference to users |
| lead_id | UUID (FK) | Reference to leads |
| price | DECIMAL | Amount paid |
| created_at | TIMESTAMP | Purchase time |

### transactions
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| user_id | UUID (FK) | Reference to users |
| type | ENUM('topup', 'buy', 'refund')| Type of movement |
| amount | DECIMAL | Value |
| created_at | TIMESTAMP | Time |

### settings
| Column | Type | Description |
| :--- | :--- | :--- |
| id | UUID (PK) | Primary Key |
| key | VARCHAR (UQ) | Setting identifier |
| value | TEXT | Configuration value |
