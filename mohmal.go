package main

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Mohmal 이메일 정보
type MohmalEmail struct {
	Address  string
	Username string
	Domain   string
}

// Mohmal 클라이언트
type MohmalClient struct {
	BaseURL string
	Client  *http.Client
}

// 새로운 Mohmal 클라이언트 생성
func NewMohmalClient() *MohmalClient {
	return &MohmalClient{
		BaseURL: "https://www.mohmal.com",
		Client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Mohmal에서 임시 이메일 생성
func (c *MohmalClient) CreateEmail() (*MohmalEmail, error) {
	// Mohmal 메인 페이지 접속
	resp, err := c.Client.Get(c.BaseURL + "/ko")
	if err != nil {
		return nil, fmt.Errorf("Mohmal 접속 실패: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %v", err)
	}

	bodyStr := string(body)

	// 이메일 주소 추출 (정규식)
	emailPattern := regexp.MustCompile(`([a-zA-Z0-9]+)@mohmal\.com`)
	matches := emailPattern.FindStringSubmatch(bodyStr)

	if len(matches) < 2 {
		return nil, fmt.Errorf("이메일 주소를 찾을 수 없습니다")
	}

	username := matches[1]
	domain := "mohmal.com"
	address := fmt.Sprintf("%s@%s", username, domain)

	return &MohmalEmail{
		Address:  address,
		Username: username,
		Domain:   domain,
	}, nil
}

// 메시지 확인 (간단한 구현)
func (c *MohmalClient) CheckMessages(username string) ([]string, error) {
	// Mohmal의 받은편지함 URL
	url := fmt.Sprintf("%s/ko/inbox/%s", c.BaseURL, username)

	resp, err := c.Client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("받은편지함 접속 실패: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %v", err)
	}

	bodyStr := string(body)

	// 메시지 제목 추출 (간단한 구현)
	subjectPattern := regexp.MustCompile(`<td[^>]*class="[^"]*subject[^"]*"[^>]*>([^<]+)</td>`)
	subjects := subjectPattern.FindAllStringSubmatch(bodyStr, -1)

	var messages []string
	for _, match := range subjects {
		if len(match) > 1 {
			subject := strings.TrimSpace(match[1])
			if subject != "" {
				messages = append(messages, subject)
			}
		}
	}

	return messages, nil
}

// Mohmal로 임시 이메일 생성 (통합 함수)
func CreateMohmalTemporaryEmail() (*MohmalClient, *MohmalEmail, error) {
	fmt.Println("🔄 Mohmal을 통해 임시 이메일을 생성합니다...")

	client := NewMohmalClient()

	// 이메일 생성
	email, err := client.CreateEmail()
	if err != nil {
		return nil, nil, fmt.Errorf("Mohmal 이메일 생성 실패: %v", err)
	}

	fmt.Printf("✅ Mohmal 임시 이메일이 생성되었습니다: %s\n", email.Address)

	return client, email, nil
}

// 인증 코드 추출 (Mohmal용)
func ExtractMohmalVerificationCode(messageContent string) (string, error) {
	// 일반적인 인증 코드 패턴들
	patterns := []string{
		`(?i)(?:verification|confirm|activate|code).*?([0-9]{4,8})`,
		`(?i)([0-9]{4,8}).*?(?:verification|confirm|activate|code)`,
		`\b([0-9]{6})\b`, // 6자리 숫자
		`\b([0-9]{4})\b`, // 4자리 숫자
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(messageContent)
		if len(matches) > 1 {
			return matches[1], nil
		}
	}

	return "", fmt.Errorf("인증 코드를 찾을 수 없습니다")
}
