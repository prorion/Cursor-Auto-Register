package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// ExtensionServer - Chrome Extension과 통신하는 HTTP 서버 //
type ExtensionServer struct {
	port      string
	userData  *UserData
	dataReady bool
	mutex     sync.RWMutex

	// 중앙제어 시스템
	sessions      map[string]*AutomationSession
	sessionsMutex sync.RWMutex
}

// UserData - Extension에 전달할 사용자 데이터 ㅎㅎ
type UserData struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Password  string `json:"password"`
}

// StatusResponse - 서버 상태 응답
type StatusResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Time    string `json:"time"`
}

// ========== 중앙제어 시스템 구조체 ==========

// AutomationSession - 자동화 세션
type AutomationSession struct {
	SessionID    string          `json:"sessionId"`
	CurrentStep  int             `json:"currentStep"`
	CurrentPage  string          `json:"currentPage"`
	PageState    *PageState      `json:"pageState"`
	Commands     []Command       `json:"commands"`
	Results      []CommandResult `json:"results"`
	LastActivity time.Time       `json:"lastActivity"`
	Status       string          `json:"status"` // "active", "waiting", "completed", "error"
}

// PageState - 페이지 상태 정보
type PageState struct {
	SessionID         string                 `json:"sessionId"`
	URL               string                 `json:"url"`
	Hostname          string                 `json:"hostname"`
	Pathname          string                 `json:"pathname"`
	PageType          string                 `json:"pageType"`
	AvailableElements map[string]interface{} `json:"availableElements"`
	Timestamp         int64                  `json:"timestamp"`
	IsProcessing      bool                   `json:"isProcessing"`
	CurrentStep       string                 `json:"currentStep"`
}

// Command - 실행할 명령
type Command struct {
	ID          string                 `json:"id"`
	Type        string                 `json:"type"`
	Description string                 `json:"description,omitempty"`
	Selector    string                 `json:"selector,omitempty"`
	Index       *int                   `json:"index,omitempty"`
	Text        string                 `json:"text,omitempty"`
	Value       string                 `json:"value,omitempty"`
	Name        string                 `json:"name,omitempty"`
	ElementType string                 `json:"elementType,omitempty"`
	Delay       int                    `json:"delay,omitempty"`
	Duration    int                    `json:"duration,omitempty"`
	URL         string                 `json:"url,omitempty"`
	Condition   string                 `json:"condition,omitempty"`
	Message     string                 `json:"message,omitempty"`
	Data        map[string]interface{} `json:"data,omitempty"`
}

// CommandResult - 명령 실행 결과
type CommandResult struct {
	SessionID string                 `json:"sessionId"`
	CommandID string                 `json:"commandId"`
	Command   Command                `json:"command"`
	Success   bool                   `json:"success"`
	Result    map[string]interface{} `json:"result"`
	Error     string                 `json:"error,omitempty"`
	Timestamp int64                  `json:"timestamp"`
	URL       string                 `json:"url"`
}

// NewExtensionServer - 새로운 Extension 서버 생성
func NewExtensionServer(port string) *ExtensionServer {
	return &ExtensionServer{
		port:      port,
		dataReady: false,
		sessions:  make(map[string]*AutomationSession),
	}
}

// SetUserData - 사용자 데이터 설정
func (s *ExtensionServer) SetUserData(firstName, lastName, email, password string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.userData = &UserData{
		FirstName: firstName,
		LastName:  lastName,
		Email:     email,
		Password:  password,
	}
	s.dataReady = true

	fmt.Printf("📊 Extension 서버에 사용자 데이터 설정됨:\n")
	fmt.Printf("   - 이름: %s %s\n", firstName, lastName)
	fmt.Printf("   - 이메일: %s\n", email)
	fmt.Printf("   - 비밀번호: %s\n", password)
}

// GetUserData - 사용자 데이터 가져오기
func (s *ExtensionServer) GetUserData() (*UserData, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.userData, s.dataReady
}

// ClearUserData - 사용자 데이터 클리어
func (s *ExtensionServer) ClearUserData() {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.userData = nil
	s.dataReady = false
}

// Start - HTTP 서버 시작
func (s *ExtensionServer) Start() error {
	mux := http.NewServeMux()

	// CORS 미들웨어
	corsHandler := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// CORS 헤더 설정
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			// Preflight 요청 처리
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// 라우트 등록
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/get-user-data", s.handleGetUserData)
	mux.HandleFunc("/clear-user-data", s.handleClearUserData)
	mux.HandleFunc("/generate-email", s.handleGenerateEmail)

	// 중앙제어 API
	mux.HandleFunc("/report-state", s.handleReportState)
	mux.HandleFunc("/get-next-command", s.handleGetNextCommand)
	mux.HandleFunc("/report-result", s.handleReportResult)

	// 서버 설정
	server := &http.Server{
		Addr:         ":" + s.port,
		Handler:      corsHandler(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	fmt.Printf("🌐 Extension HTTP 서버가 포트 %s에서 시작됩니다...\n", s.port)
	fmt.Printf("   - 상태 확인: http://localhost:%s/status\n", s.port)
	fmt.Printf("   - 사용자 데이터: http://localhost:%s/get-user-data\n", s.port)

	return server.ListenAndServe()
}

// handleStatus - 서버 상태 확인 핸들러
func (s *ExtensionServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	response := StatusResponse{
		Status:  "ok",
		Message: "Cursor Extension HTTP 서버가 정상 작동 중입니다",
		Time:    time.Now().Format("2006-01-02 15:04:05"),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	fmt.Printf("📡 Extension에서 상태 확인 요청 - %s\n", time.Now().Format("15:04:05"))
}

// handleGetUserData - 사용자 데이터 가져오기 핸들러
func (s *ExtensionServer) handleGetUserData(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userData, ready := s.GetUserData()
	if !ready || userData == nil {
		http.Error(w, "사용자 데이터가 준비되지 않았습니다", http.StatusNotFound)
		fmt.Printf("⚠️ Extension에서 사용자 데이터 요청했지만 준비되지 않음\n")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userData)

	fmt.Printf("📤 Extension에 사용자 데이터 전송 완료 - %s (%s)\n",
		userData.Email, time.Now().Format("15:04:05"))
}

// handleClearUserData - 사용자 데이터 클리어 핸들러
func (s *ExtensionServer) handleClearUserData(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.ClearUserData()

	response := map[string]string{
		"status":  "ok",
		"message": "사용자 데이터가 클리어되었습니다",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	fmt.Printf("🗑️ 사용자 데이터 클리어됨 - %s\n", time.Now().Format("15:04:05"))
}

// handleGenerateEmail - 이메일 생성 및 사용자 데이터 설정 핸들러
func (s *ExtensionServer) handleGenerateEmail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	fmt.Printf("📧 Extension에서 이메일 생성 요청 - %s\n", time.Now().Format("15:04:05"))

	// Mail.tm으로 임시 이메일 생성
	_, tmAccount, err := CreateTMTemporaryEmail()
	if err != nil {
		fmt.Printf("❌ 임시 이메일 생성 실패: %v\n", err)
		http.Error(w, "이메일 생성 실패", http.StatusInternalServerError)
		return
	}

	// 랜덤 사용자 정보 생성
	firstName := generateRandomName()
	lastName := generateRandomName()
	password := generateRandomPassword()
	email := tmAccount.Address

	// Extension 서버에 사용자 데이터 설정
	s.SetUserData(firstName, lastName, email, password)

	// 응답 데이터 구성
	response := map[string]interface{}{
		"email":     email,
		"firstName": firstName,
		"lastName":  lastName,
		"password":  password,
		"message":   "이메일이 성공적으로 생성되었습니다",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	fmt.Printf("✅ Extension에 이메일 데이터 전송 완료 - %s (%s)\n", email, time.Now().Format("15:04:05"))
}

// StartExtensionServer - Extension 서버를 백그라운드에서 시작
func StartExtensionServer() *ExtensionServer {
	server := NewExtensionServer("8080")

	// 백그라운드에서 서버 시작
	go func() {
		if err := server.Start(); err != nil {
			fmt.Printf("❌ Extension 서버 시작 실패: %v\n", err)
		}
	}()

	// 서버가 시작될 시간을 주기 위해 잠시 대기
	time.Sleep(500 * time.Millisecond)

	return server
}

// ========== 중앙제어 API 핸들러들 ==========

// handleReportState - 페이지 상태 보고 처리
func (s *ExtensionServer) handleReportState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST method required", http.StatusMethodNotAllowed)
		return
	}

	var pageState PageState
	if err := json.NewDecoder(r.Body).Decode(&pageState); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.sessionsMutex.Lock()
	defer s.sessionsMutex.Unlock()

	// 세션 찾기 또는 생성
	session, exists := s.sessions[pageState.SessionID]
	if !exists {
		session = &AutomationSession{
			SessionID:    pageState.SessionID,
			CurrentStep:  0,
			CurrentPage:  pageState.PageType,
			Commands:     []Command{},
			Results:      []CommandResult{},
			LastActivity: time.Now(),
			Status:       "active",
		}
		s.sessions[pageState.SessionID] = session

		// 새 세션에 대한 명령 시퀀스 생성
		s.generateCommandSequence(session, pageState.PageType)
	}

	// 페이지 상태 업데이트
	session.PageState = &pageState
	session.LastActivity = time.Now()
	session.CurrentPage = pageState.PageType

	fmt.Printf("📡 상태 보고 수신: %s (%s) - %s\n", pageState.SessionID, pageState.PageType, pageState.URL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "received",
		"sessionId": pageState.SessionID,
	})
}

// handleGetNextCommand - 다음 명령 요청 처리
func (s *ExtensionServer) handleGetNextCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST method required", http.StatusMethodNotAllowed)
		return
	}

	var request struct {
		SessionID   string `json:"sessionId"`
		URL         string `json:"url"`
		PageType    string `json:"pageType"`
		CurrentStep string `json:"currentStep"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.sessionsMutex.RLock()
	session, exists := s.sessions[request.SessionID]
	s.sessionsMutex.RUnlock()

	if !exists {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"type":    "wait_for_next",
			"message": "세션을 찾을 수 없습니다",
		})
		return
	}

	// 다음 실행할 명령 찾기
	var nextCommand *Command
	if session.CurrentStep < len(session.Commands) {
		nextCommand = &session.Commands[session.CurrentStep]

		s.sessionsMutex.Lock()
		session.CurrentStep++
		s.sessionsMutex.Unlock()

		fmt.Printf("🎯 명령 전송: %s - %s (%s)\n", request.SessionID, nextCommand.Type, nextCommand.Description)
	}

	w.Header().Set("Content-Type", "application/json")
	if nextCommand != nil {
		json.NewEncoder(w).Encode(nextCommand)
	} else {
		json.NewEncoder(w).Encode(map[string]string{
			"type":    "wait_for_next",
			"message": "모든 명령이 완료되었습니다",
		})
	}
}

// handleReportResult - 명령 실행 결과 보고 처리
func (s *ExtensionServer) handleReportResult(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST method required", http.StatusMethodNotAllowed)
		return
	}

	var result CommandResult
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.sessionsMutex.Lock()
	defer s.sessionsMutex.Unlock()

	session, exists := s.sessions[result.SessionID]
	if !exists {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	// 결과 저장
	session.Results = append(session.Results, result)
	session.LastActivity = time.Now()

	if result.Success {
		fmt.Printf("✅ 명령 성공: %s - %s\n", result.SessionID, result.CommandID)
	} else {
		fmt.Printf("❌ 명령 실패: %s - %s: %s\n", result.SessionID, result.CommandID, result.Error)
		session.Status = "error"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "received",
		"sessionId": result.SessionID,
	})
}

// generateCommandSequence - 페이지 타입에 따른 명령 시퀀스 생성
func (s *ExtensionServer) generateCommandSequence(session *AutomationSession, pageType string) {
	fmt.Printf("🎯 명령 시퀀스 생성: %s (%s)\n", session.SessionID, pageType)

	switch pageType {
	case "main":
		// cursor.com 메인 페이지 명령들
		session.Commands = []Command{
			{
				ID:          "main_01",
				Type:        "click",
				Description: "Sign in 버튼 클릭",
				Text:        "Sign in",
				ElementType: "link",
				Delay:       2000,
			},
			{
				ID:          "main_02",
				Type:        "wait",
				Description: "페이지 전환 대기",
				Duration:    3000,
			},
		}

	case "dashboard":
		// dashboard 페이지 (리다이렉트 대기)
		session.Commands = []Command{
			{
				ID:          "dashboard_01",
				Type:        "wait",
				Description: "리다이렉트 대기",
				Duration:    5000,
			},
		}

	case "authenticator":
		// authenticator.cursor.sh 페이지 명령들
		session.Commands = []Command{
			{
				ID:          "auth_01",
				Type:        "click",
				Description: "Sign up 링크 클릭",
				Text:        "Sign up",
				ElementType: "link",
				Delay:       2000,
			},
			{
				ID:          "auth_02",
				Type:        "wait",
				Description: "회원가입 페이지 로딩 대기",
				Duration:    3000,
			},
			{
				ID:          "auth_03",
				Type:        "type",
				Description: "이름 입력",
				Name:        "first_name",
				Value:       s.userData.FirstName,
			},
			{
				ID:          "auth_04",
				Type:        "type",
				Description: "성 입력",
				Name:        "last_name",
				Value:       s.userData.LastName,
			},
			{
				ID:          "auth_05",
				Type:        "type",
				Description: "이메일 입력",
				Name:        "email",
				Value:       s.userData.Email,
			},
			{
				ID:          "auth_06",
				Type:        "click",
				Description: "첫 번째 Continue 버튼 클릭",
				Text:        "Continue",
				ElementType: "button",
				Delay:       1500,
			},
			{
				ID:          "auth_07",
				Type:        "wait",
				Description: "비밀번호 필드 대기",
				Duration:    2000,
			},
			{
				ID:          "auth_08",
				Type:        "type",
				Description: "비밀번호 입력",
				Name:        "password",
				Value:       s.userData.Password,
			},
			{
				ID:          "auth_09",
				Type:        "click",
				Description: "두 번째 Continue 버튼 클릭",
				Text:        "Continue",
				ElementType: "button",
				Delay:       1500,
			},
			{
				ID:          "auth_10",
				Type:        "complete",
				Description: "회원가입 완료",
				Message:     "성공적으로 회원가입이 완료되었습니다!",
			},
		}

	default:
		session.Commands = []Command{
			{
				ID:          "unknown_01",
				Type:        "wait",
				Description: "알 수 없는 페이지 대기",
				Duration:    2000,
			},
		}
	}

	fmt.Printf("📋 생성된 명령 수: %d개\n", len(session.Commands))
}
