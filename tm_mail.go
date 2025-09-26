package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Mail.tm API 구조체들
type TMAccount struct {
	ID         string `json:"id"`
	Address    string `json:"address"`
	Quota      int    `json:"quota"`
	Used       int    `json:"used"`
	IsDisabled bool   `json:"isDisabled"`
	IsDeleted  bool   `json:"isDeleted"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type TMDomain struct {
	ID        string `json:"id"`
	Domain    string `json:"domain"`
	IsActive  bool   `json:"isActive"`
	IsPrivate bool   `json:"isPrivate"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type TMMessage struct {
	ID             string         `json:"id"`
	AccountID      string         `json:"accountId"`
	MsgID          string         `json:"msgid"`
	From           TMAddress      `json:"from"`
	To             []TMAddress    `json:"to"`
	CC             []string       `json:"cc"`
	BCC            []string       `json:"bcc"`
	Subject        string         `json:"subject"`
	Intro          string         `json:"intro"`
	Text           string         `json:"text"`
	HTML           []string       `json:"html"`
	Seen           bool           `json:"seen"`
	Flagged        bool           `json:"flagged"`
	IsDeleted      bool           `json:"isDeleted"`
	Verifications  []string       `json:"verifications"`
	Retention      bool           `json:"retention"`
	RetentionDate  string         `json:"retentionDate"`
	HasAttachments bool           `json:"hasAttachments"`
	Attachments    []TMAttachment `json:"attachments"`
	Size           int            `json:"size"`
	DownloadUrl    string         `json:"downloadUrl"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
}

type TMAddress struct {
	Address string `json:"address"`
	Name    string `json:"name"`
}

type TMAttachment struct {
	ID               string `json:"id"`
	Filename         string `json:"filename"`
	ContentType      string `json:"contentType"`
	Disposition      string `json:"disposition"`
	TransferEncoding string `json:"transferEncoding"`
	Related          bool   `json:"related"`
	Size             int    `json:"size"`
	DownloadUrl      string `json:"downloadUrl"`
}

type TMToken struct {
	Token string `json:"token"`
	ID    string `json:"id"`
}

type TMCreateAccountRequest struct {
	Address  string `json:"address"`
	Password string `json:"password"`
}

// Mail.tm API 클라이언트
type TMClient struct {
	BaseURL string
	Token   string
	Client  *http.Client
}

// 새로운 Mail.tm 클라이언트 생성
func NewTMClient() *TMClient {
	return &TMClient{
		BaseURL: "https://api.mail.tm",
		Client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// 사용 가능한 도메인 목록 조회
func (c *TMClient) GetDomains() ([]TMDomain, error) {
	resp, err := c.makeRequest("GET", "/domains", nil)
	if err != nil {
		return nil, fmt.Errorf("도메인 조회 실패: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP 오류: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %v", err)
	}

	// 디버깅: 실제 응답 확인 (필요시 주석 해제)
	// fmt.Printf("🔍 도메인 API 응답: %s\n", string(body))

	// 실제 API 응답이 배열 형태인지 hydra 형태인지 확인
	var domains []TMDomain
	if err := json.Unmarshal(body, &domains); err != nil {
		// 배열이 아니면 hydra 구조체 시도
		var result struct {
			HydraMember     []TMDomain `json:"hydra:member"`
			HydraTotalItems int        `json:"hydra:totalItems"`
		}
		if err2 := json.Unmarshal(body, &result); err2 != nil {
			return nil, fmt.Errorf("JSON 파싱 실패 (배열: %v, hydra: %v). 응답: %s", err, err2, string(body))
		}
		return result.HydraMember, nil
	}

	return domains, nil
}

// 임시 계정 생성
func (c *TMClient) CreateAccount(username string, domain string, password string) (*TMAccount, error) {
	address := fmt.Sprintf("%s@%s", username, domain)

	reqBody := TMCreateAccountRequest{
		Address:  address,
		Password: password,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("JSON 생성 실패: %v", err)
	}

	resp, err := c.makeRequest("POST", "/accounts", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("계정 생성 실패: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("계정 생성 HTTP 오류 %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %v", err)
	}

	var account TMAccount
	if err := json.Unmarshal(body, &account); err != nil {
		return nil, fmt.Errorf("JSON 파싱 실패: %v", err)
	}

	return &account, nil
}

// 로그인하여 토큰 얻기
func (c *TMClient) Login(address, password string) error {
	reqBody := map[string]string{
		"address":  address,
		"password": password,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("JSON 생성 실패: %v", err)
	}

	resp, err := c.makeRequest("POST", "/token", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("로그인 실패: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("로그인 HTTP 오류 %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("응답 읽기 실패: %v", err)
	}

	var token TMToken
	if err := json.Unmarshal(body, &token); err != nil {
		return fmt.Errorf("JSON 파싱 실패: %v", err)
	}

	c.Token = token.Token
	return nil
}

// 메시지 목록 조회
func (c *TMClient) GetMessages() ([]TMMessage, error) {
	if c.Token == "" {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}

	resp, err := c.makeAuthenticatedRequest("GET", "/messages", nil)
	if err != nil {
		return nil, fmt.Errorf("메시지 조회 실패: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("메시지 조회 HTTP 오류 %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %v", err)
	}

	// 실제 API 응답이 배열 형태인지 hydra 형태인지 확인
	var messages []TMMessage
	if err := json.Unmarshal(body, &messages); err != nil {
		// 배열이 아니면 hydra 구조체 시도
		var result struct {
			HydraMember     []TMMessage `json:"hydra:member"`
			HydraTotalItems int         `json:"hydra:totalItems"`
		}
		if err2 := json.Unmarshal(body, &result); err2 != nil {
			return nil, fmt.Errorf("JSON 파싱 실패 (배열: %v, hydra: %v)", err, err2)
		}
		return result.HydraMember, nil
	}

	return messages, nil
}

// 특정 메시지 조회
func (c *TMClient) GetMessage(messageID string) (*TMMessage, error) {
	if c.Token == "" {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}

	resp, err := c.makeAuthenticatedRequest("GET", "/messages/"+messageID, nil)
	if err != nil {
		return nil, fmt.Errorf("메시지 조회 실패: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("메시지 조회 HTTP 오류 %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("응답 읽기 실패: %v", err)
	}

	var message TMMessage
	if err := json.Unmarshal(body, &message); err != nil {
		return nil, fmt.Errorf("JSON 파싱 실패: %v", err)
	}

	return &message, nil
}

// HTTP 요청 생성
func (c *TMClient) makeRequest(method, endpoint string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, c.BaseURL+endpoint, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Go-Mail-TM-Client/1.0")

	return c.Client.Do(req)
}

// 인증이 필요한 HTTP 요청 생성
func (c *TMClient) makeAuthenticatedRequest(method, endpoint string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, c.BaseURL+endpoint, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("User-Agent", "Go-Mail-TM-Client/1.0")

	return c.Client.Do(req)
}

// 임시 이메일 생성 및 설정 (통합 함수)
func CreateTMTemporaryEmail() (*TMClient, *TMAccount, error) {
	fmt.Println("🔄 Mail.tm을 통해 임시 이메일을 생성합니다...")

	// 클라이언트 생성
	client := NewTMClient()

	// 도메인 목록 조회
	fmt.Println("📋 사용 가능한 도메인을 조회합니다...")
	domains, err := client.GetDomains()
	if err != nil {
		return nil, nil, fmt.Errorf("도메인 조회 실패: %v", err)
	}

	if len(domains) == 0 {
		return nil, nil, fmt.Errorf("사용 가능한 도메인이 없습니다")
	}

	// 첫 번째 활성 도메인 선택
	var selectedDomain string
	for _, domain := range domains {
		if domain.IsActive && !domain.IsPrivate {
			selectedDomain = domain.Domain
			break
		}
	}

	if selectedDomain == "" {
		return nil, nil, fmt.Errorf("사용 가능한 공개 도메인이 없습니다")
	}

	// 랜덤 사용자명과 비밀번호 생성
	username := generateRandomUsername()
	password := generateRandomPassword()

	fmt.Printf("🌐 도메인: %s\n", selectedDomain)
	fmt.Printf("👤 사용자명: %s\n", username)

	// 계정 생성 (재시도 로직 포함)
	fmt.Println("👤 계정을 생성합니다...")
	var account *TMAccount
	for attempts := 1; attempts <= 3; attempts++ {
		fmt.Printf("📡 시도 %d/3...\n", attempts)

		account, err = client.CreateAccount(username, selectedDomain, password)
		if err == nil {
			break
		}

		if attempts < 3 {
			waitTime := time.Duration(attempts*10) * time.Second // 10초, 20초로 증가
			fmt.Printf("⏳ %v 후 재시도합니다... (오류: %v)\n", waitTime, err)
			time.Sleep(waitTime)
			// 새로운 랜덤 사용자명 생성
			username = generateRandomUsername()
			fmt.Printf("👤 새 사용자명: %s\n", username)
		}
	}

	if err != nil {
		return nil, nil, fmt.Errorf("계정 생성 실패 (3회 시도): %v", err)
	}

	// 로그인
	fmt.Println("🔐 로그인합니다...")
	err = client.Login(account.Address, password)
	if err != nil {
		return nil, nil, fmt.Errorf("로그인 실패: %v", err)
	}

	fmt.Printf("✅ 임시 이메일이 생성되었습니다: %s\n", account.Address)
	return client, account, nil
}

// 새 메일이 도착할 때까지 대기
func WaitForNewMessage(client *TMClient, timeoutSeconds int) (*TMMessage, error) {
	fmt.Printf("📧 새 메일을 %d초간 기다립니다...\n", timeoutSeconds)

	timeout := time.After(time.Duration(timeoutSeconds) * time.Second)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	var lastMessageCount int
	initialMessages, err := client.GetMessages()
	if err == nil {
		lastMessageCount = len(initialMessages)
	}

	for {
		select {
		case <-timeout:
			return nil, fmt.Errorf("시간 초과: %d초 동안 새 메일이 도착하지 않았습니다", timeoutSeconds)
		case <-ticker.C:
			messages, err := client.GetMessages()
			if err != nil {
				fmt.Printf("⚠️ 메시지 조회 중 오류: %v\n", err)
				continue
			}

			if len(messages) > lastMessageCount {
				fmt.Printf("📧 새 메일이 도착했습니다! (총 %d개)\n", len(messages))
				// 가장 최근 메시지 반환
				return &messages[0], nil
			}

			fmt.Printf("⏳ 메일 대기 중... (현재 %d개)\n", len(messages))
		}
	}
}

// 메시지에서 6자리 인증 코드 추출
func ExtractVerificationCode(message *TMMessage) (string, error) {
	// HTML과 텍스트 내용을 모두 검사
	htmlContent := ""
	if len(message.HTML) > 0 {
		htmlContent = strings.Join(message.HTML, " ")
	}
	content := htmlContent + " " + message.Text + " " + message.Subject

	// Cursor 이메일에 특화된 패턴들 (우선순위 순)
	patterns := []string{
		// Cursor 특화 패턴들
		`font-size:28px[^>]*>(\d{6})<`,      // 큰 폰트 사이즈의 6자리 코드 (Cursor 스타일)
		`letter-spacing:2px[^>]*>(\d{6})<`,  // 글자 간격이 있는 6자리 코드
		`Enter the code[^>]*>.*?(\d{6})`,    // "Enter the code" 다음의 6자리
		`verification code[^>]*>.*?(\d{6})`, // "verification code" 다음의 6자리

		// 일반적인 패턴들
		`\b(\d{6})\b`,       // 독립된 6자리 숫자
		`code.*?(\d{6})`,    // "code" 다음의 6자리
		`verify.*?(\d{6})`,  // "verify" 다음의 6자리
		`confirm.*?(\d{6})`, // "confirm" 다음의 6자리

		// HTML 태그 내부 검색
		`<div[^>]*>(\d{6})</div>`,   // div 태그 안의 6자리
		`<span[^>]*>(\d{6})</span>`, // span 태그 안의 6자리
		`<p[^>]*>(\d{6})</p>`,       // p 태그 안의 6자리
	}

	for i, pattern := range patterns {
		re := regexp.MustCompile(`(?i)` + pattern)
		matches := re.FindStringSubmatch(content)
		if len(matches) > 1 {
			code := matches[1]
			fmt.Printf("🔍 패턴 %d로 인증 코드 발견: %s\n", i+1, code)
			return code, nil
		}
	}

	// 디버깅을 위해 HTML 내용의 일부 출력
	fmt.Printf("🔍 인증 코드 검색 실패. HTML 내용 샘플:\n%s\n",
		truncateString(htmlContent, 500))

	return "", fmt.Errorf("인증 코드를 찾을 수 없습니다")
}

// 메시지 내용 출력
func PrintTMMessageInfo(message *TMMessage) {
	fmt.Println("\n📧 메시지 정보:")
	fmt.Printf("📋 제목: %s\n", message.Subject)
	fmt.Printf("📨 발신자: %s <%s>\n", message.From.Name, message.From.Address)
	fmt.Printf("📅 수신 시간: %s\n", message.CreatedAt)
	fmt.Printf("📝 미리보기: %s\n", message.Intro)

	if message.Text != "" {
		fmt.Printf("📄 텍스트 내용 (처음 200자):\n%s\n",
			truncateString(message.Text, 200))
	}

	if len(message.HTML) > 0 {
		// HTML 태그 제거 후 출력
		htmlContent := strings.Join(message.HTML, " ")
		textContent := stripHTMLTags(htmlContent)
		fmt.Printf("🌐 HTML 내용 (처음 200자):\n%s\n",
			truncateString(textContent, 200))
	}
}

// 랜덤 사용자명 생성 (더 고유하게)
func generateRandomUsername() string {
	adjectives := []string{"quhick", "brzight", "clerver", "smeart", "swihft", "boltd", "caslm", "wicse", "kxind", "czgool",
		"brwtave", "v2fast", "seharp", "miz4ld", "wa5arm", "cov1ld", "fr7hesh", "wil2jd", "qui8aet", "ls2oud"}
	nouns := []string{"fy1ox", "ccazt", "ohwl", "wwolf", "beear", "l5ion", "eaygle", "sv2hark", "ty2iger", "dey22er",
		"hy4awk", "bz5ee", "z6ant", "fh2ish", "bir4rd", "fr3zog", "du6sck", "gof2at", "l3damb", "sy2eal"}

	// 더 긴 타임스탬프와 랜덤 조합 사용
	timestamp := time.Now().UnixNano()
	adj := adjectives[timestamp%int64(len(adjectives))]
	noun := nouns[(timestamp/1000)%int64(len(nouns))]

	// 마이크로초까지 포함하여 더 고유한 번호 생성
	uniqueNum := timestamp % 100000 // 5자리 숫자

	return fmt.Sprintf("%s%s%d", adj, noun, uniqueNum)
}

// HTML 태그 제거
func stripHTMLTags(html string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	return re.ReplaceAllString(html, "")
}

// 문자열 자르기
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// Mail.tm 임시 이메일 테스트 함수
func TestTMEmail() {
	fmt.Println("\n🚀 Mail.tm API 테스트를 시작합니다...")

	// 임시 이메일 생성
	client, account, err := CreateTMTemporaryEmail()
	if err != nil {
		fmt.Printf("❌ 임시 이메일 생성 실패: %v\n", err)
		return
	}

	fmt.Printf("\n📧 생성된 이메일: %s\n", account.Address)
	fmt.Println("이 이메일 주소를 복사해서 테스트에 사용하세요.")
	fmt.Println("📧 새 메일을 기다리는 중... (60초 타임아웃)")

	// 새 메일 대기
	message, err := WaitForNewMessage(client, 60)
	if err != nil {
		fmt.Printf("⚠️ %v\n", err)
		return
	}

	// 메시지 정보 출력
	PrintTMMessageInfo(message)

	// 인증 코드 추출 시도
	code, err := ExtractVerificationCode(message)
	if err != nil {
		fmt.Printf("⚠️ %v\n", err)
	} else {
		fmt.Printf("🔐 추출된 인증 코드: %s\n", code)
	}
}
