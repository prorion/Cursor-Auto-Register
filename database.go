package main

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Account 구조체 정의
type Account struct {
	ID          int       `json:"id"`
	AccountMail string    `json:"account_mail"`
	Password    string    `json:"password"`
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	CreatedAt   time.Time `json:"created_at"`
	IsUsed      bool      `json:"is_used"`
}

// ===========================================
// 데이터베이스 관련 함수들
// ===========================================

// InitializeDatabase - 데이터베이스 초기화 및 테이블 생성
func InitializeDatabase() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "./accounts.db")
	if err != nil {
		return nil, fmt.Errorf("데이터베이스 연결 실패: %w", err)
	}

	// 테이블 생성 쿼리
	createTableQuery := `
	CREATE TABLE IF NOT EXISTS accounts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_mail TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		first_name TEXT NOT NULL,
		last_name TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		is_used BOOLEAN DEFAULT FALSE
	);`

	_, err = db.Exec(createTableQuery)
	if err != nil {
		return nil, fmt.Errorf("테이블 생성 실패: %w", err)
	}

	return db, nil
}

// CreateAccount - 새 계정 생성
func CreateAccount(db *sql.DB, account Account) (int64, error) {
	query := `
	INSERT INTO accounts (account_mail, password, first_name, last_name, is_used)
	VALUES (?, ?, ?, ?, ?)`

	result, err := db.Exec(query, account.AccountMail, account.Password,
		account.FirstName, account.LastName, account.IsUsed)
	if err != nil {
		return 0, fmt.Errorf("계정 생성 실패: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("ID 가져오기 실패: %w", err)
	}

	return id, nil
}

// GetAccountByID - ID로 계정 조회
func GetAccountByID(db *sql.DB, id int) (*Account, error) {
	query := `
	SELECT id, account_mail, password, first_name, last_name, created_at, is_used
	FROM accounts WHERE id = ?`

	row := db.QueryRow(query, id)

	var account Account
	err := row.Scan(&account.ID, &account.AccountMail, &account.Password,
		&account.FirstName, &account.LastName, &account.CreatedAt, &account.IsUsed)
	if err != nil {
		return nil, fmt.Errorf("계정 조회 실패: %w", err)
	}

	return &account, nil
}

// GetAllAccounts - 모든 계정 조회
func GetAllAccounts(db *sql.DB) ([]Account, error) {
	query := `
	SELECT id, account_mail, password, first_name, last_name, created_at, is_used
	FROM accounts ORDER BY created_at DESC`

	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("계정 목록 조회 실패: %w", err)
	}
	defer rows.Close()

	var accounts []Account
	for rows.Next() {
		var account Account
		err := rows.Scan(&account.ID, &account.AccountMail, &account.Password,
			&account.FirstName, &account.LastName, &account.CreatedAt, &account.IsUsed)
		if err != nil {
			return nil, fmt.Errorf("계정 스캔 실패: %w", err)
		}
		accounts = append(accounts, account)
	}

	return accounts, nil
}

// UpdateAccountUsed - 계정 사용 상태 업데이트
func UpdateAccountUsed(db *sql.DB, id int, isUsed bool) error {
	query := `UPDATE accounts SET is_used = ? WHERE id = ?`

	_, err := db.Exec(query, isUsed, id)
	if err != nil {
		return fmt.Errorf("계정 상태 업데이트 실패: %w", err)
	}

	return nil
}

// DeleteAccount - 계정 삭제
func DeleteAccount(db *sql.DB, id int) error {
	query := `DELETE FROM accounts WHERE id = ?`

	result, err := db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("계정 삭제 실패: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("삭제 결과 확인 실패: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("해당 ID의 계정을 찾을 수 없습니다: %d", id)
	}

	return nil
}

// GetUnusedAccounts - 사용되지 않은 계정들 조회
func GetUnusedAccounts(db *sql.DB) ([]Account, error) {
	query := `
	SELECT id, account_mail, password, first_name, last_name, created_at, is_used
	FROM accounts WHERE is_used = FALSE ORDER BY created_at DESC`

	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("미사용 계정 조회 실패: %w", err)
	}
	defer rows.Close()

	var accounts []Account
	for rows.Next() {
		var account Account
		err := rows.Scan(&account.ID, &account.AccountMail, &account.Password,
			&account.FirstName, &account.LastName, &account.CreatedAt, &account.IsUsed)
		if err != nil {
			return nil, fmt.Errorf("계정 스캔 실패: %w", err)
		}
		accounts = append(accounts, account)
	}

	return accounts, nil
}

// GetAccountByEmail - 이메일로 계정 조회
func GetAccountByEmail(db *sql.DB, email string) (*Account, error) {
	query := `
	SELECT id, account_mail, password, first_name, last_name, created_at, is_used
	FROM accounts WHERE account_mail = ?`

	row := db.QueryRow(query, email)

	var account Account
	err := row.Scan(&account.ID, &account.AccountMail, &account.Password,
		&account.FirstName, &account.LastName, &account.CreatedAt, &account.IsUsed)
	if err != nil {
		return nil, fmt.Errorf("계정 조회 실패: %w", err)
	}

	return &account, nil
}

// CountAccounts - 총 계정 수 조회
func CountAccounts(db *sql.DB) (int, error) {
	query := `SELECT COUNT(*) FROM accounts`

	var count int
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("계정 수 조회 실패: %w", err)
	}

	return count, nil
}

// CountUnusedAccounts - 미사용 계정 수 조회
func CountUnusedAccounts(db *sql.DB) (int, error) {
	query := `SELECT COUNT(*) FROM accounts WHERE is_used = FALSE`

	var count int
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("미사용 계정 수 조회 실패: %w", err)
	}

	return count, nil
}
