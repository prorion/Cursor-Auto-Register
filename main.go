package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"
)

func main() {
	// 데이터베이스 초기화
	db, err := InitializeDatabase()
	if err != nil {
		log.Fatalf("❌ 데이터베이스 초기화 실패: %v", err)
	}
	defer db.Close()

	fmt.Println("🗄️ 데이터베이스가 성공적으로 초기화되었습니다!")

	// 입력 스캐너 초기화
	scanner := bufio.NewScanner(os.Stdin)

	// Extension HTTP 서버 시작
	extensionServer := StartExtensionServer()
	fmt.Println("🌐 Chrome Extension과 통신할 HTTP 서버가 시작되었습니다!")

	// 단계별 메뉴 시스템
	for {
		fmt.Println("\n🎯 ===== Cursor 자동 회원가입 시스템 =====")
		fmt.Println("1. 📧 임시 이메일 생성")
		fmt.Println("2. 🎯 Chrome Extension 자동화 시작")
		fmt.Println("3. 📊 계정 통계 보기")
		fmt.Println("4. 🗄️ 계정 목록 보기")
		fmt.Println("5. 🧪 Mail.tm API 테스트")
		fmt.Println("6. 🚪 종료")
		fmt.Print("선택하세요 (1-6): ")

		// 안전한 입력 처리
		if !scanner.Scan() {
			fmt.Println("❌ 입력 읽기 실패")
			break
		}

		choice := strings.TrimSpace(scanner.Text())

		switch choice {
		case "1":
			fmt.Println("📧 임시 이메일 생성 모드")
			handleEmailGeneration()
		case "2":
			fmt.Println("🎯 Chrome Extension 자동화 모드")
			handleExtensionMode(extensionServer)
		case "3":
			fmt.Println("📊 계정 통계 보기")
			showAccountStats(db)
		case "4":
			fmt.Println("🗄️ 계정 목록 보기")
			showAccountList(db)
		case "5":
			fmt.Println("🧪 Mail.tm API 테스트")
			TestTMEmail()
		case "6", "q", "quit", "exit":
			fmt.Println("👋 프로그램을 종료합니다.")
			return
		case "":
			fmt.Println("⚠️ 빈 입력입니다. 다시 선택해주세요.")
		default:
			fmt.Printf("❌ 잘못된 선택입니다: '%s'. 1-6 중에서 선택해주세요.\n", choice)
		}
	}

	os.Exit(0)
}

// handleEmailGeneration - 임시 이메일 생성 처리
func handleEmailGeneration() {
	fmt.Println("\n📧 ===== 임시 이메일 생성 =====")
	fmt.Println("Mail.tm API를 사용하여 임시 이메일을 생성합니다.")

	// Mail.tm으로 임시 이메일 생성
	client, account, err := CreateTMTemporaryEmail()
	if err != nil {
		fmt.Printf("❌ 임시 이메일 생성 실패: %v\n", err)
		return
	}

	fmt.Printf("✅ 임시 이메일 생성 완료!\n")
	fmt.Printf("📧 이메일 주소: %s\n", account.Address)
	fmt.Printf("🆔 계정 ID: %s\n", account.ID)
	fmt.Println("\n💡 이 이메일은 임시로 사용되며, Cursor 회원가입에 사용할 수 있습니다.")

	// 새 메일 확인 옵션
	fmt.Print("\n새 메일을 확인하시겠습니까? (y/n): ")
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() && strings.ToLower(strings.TrimSpace(scanner.Text())) == "y" {
		fmt.Println("📧 새 메일을 60초간 대기합니다...")
		message, err := WaitForNewMessage(client, 60)
		if err != nil {
			fmt.Printf("⚠️ %v\n", err)
		} else {
			PrintTMMessageInfo(message)
			// 인증 코드 추출 시도
			code, err := ExtractVerificationCode(message)
			if err != nil {
				fmt.Printf("⚠️ %v\n", err)
			} else {
				fmt.Printf("🔐 추출된 인증 코드: %s\n", code)
			}
		}
	}
}

// handleExtensionMode - Chrome Extension 모드 처리
func handleExtensionMode(server *ExtensionServer) {
	fmt.Println("\n🎯 ===== Chrome Extension 자동화 모드 =====")
	fmt.Println("Chrome Extension과 연동하여 자동 회원가입을 진행합니다.")

	// 단계별 진행 선택
	fmt.Println("\n🔧 진행 방식을 선택하세요:")
	fmt.Println("1. 🤖 완전 자동 모드 (이메일 생성 + 자동화)")
	fmt.Println("2. 🎯 Extension만 활성화 (수동 이메일)")
	fmt.Println("3. 🔙 메인 메뉴로 돌아가기")
	fmt.Print("선택하세요 (1-3): ")

	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		fmt.Println("❌ 입력 읽기 실패")
		return
	}

	choice := strings.TrimSpace(scanner.Text())

	switch choice {
	case "1":
		handleFullAutoMode(server)
	case "2":
		handleExtensionOnlyMode(server)
	case "3":
		fmt.Println("🔙 메인 메뉴로 돌아갑니다.")
		return
	default:
		fmt.Println("❌ 잘못된 선택입니다.")
		return
	}
}

// handleFullAutoMode - 완전 자동 모드
func handleFullAutoMode(server *ExtensionServer) {
	fmt.Println("\n🤖 ===== 완전 자동 모드 =====")

	// 임시 이메일 생성
	fmt.Println("📧 Mail.tm API로 임시 이메일을 생성합니다...")
	_, tmAccount, err := CreateTMTemporaryEmail()
	if err != nil {
		fmt.Printf("❌ 임시 이메일 생성 실패: %v\n", err)
		return
	}

	// 사용자 정보 생성
	firstName := generateRandomName()
	lastName := generateRandomName()
	password := generateRandomPassword()
	email := tmAccount.Address

	fmt.Printf("✅ 자동 생성된 회원가입 정보:\n")
	fmt.Printf("   📧 이메일: %s\n", email)
	fmt.Printf("   👤 이름: %s %s\n", firstName, lastName)
	fmt.Printf("   🔐 비밀번호: %s\n", password)

	// Extension 서버에 사용자 데이터 설정
	server.SetUserData(firstName, lastName, email, password)

	fmt.Println("\n🚀 Chrome Extension 사용 준비 완료!")
	fmt.Println("📱 다음 단계를 따라하세요:")
	fmt.Println("   1. Chrome에서 확장프로그램이 설치되어 있는지 확인")
	fmt.Println("   2. https://cursor.com 으로 이동")
	fmt.Println("   3. Extension 팝업에서 '자동 회원가입 시작' 클릭")
	fmt.Println("   4. 자동으로 회원가입이 진행됩니다")

	fmt.Println("\n⏳ Extension에서 데이터 요청을 기다리는 중...")
	fmt.Print("💡 Enter를 누르면 메뉴로 돌아갑니다: ")

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()

	// 사용자 데이터 클리어
	server.ClearUserData()
	fmt.Println("🧹 자동 모드를 종료하고 데이터를 클리어했습니다.")
}

// handleExtensionOnlyMode - Extension만 활성화 모드
func handleExtensionOnlyMode(server *ExtensionServer) {
	fmt.Println("\n🎯 ===== Extension 전용 모드 =====")
	fmt.Println("수동으로 입력한 정보로 Extension을 활성화합니다.")

	scanner := bufio.NewScanner(os.Stdin)

	// 사용자 정보 수동 입력
	fmt.Print("📧 이메일 주소를 입력하세요: ")
	if !scanner.Scan() {
		fmt.Println("❌ 입력 실패")
		return
	}
	email := strings.TrimSpace(scanner.Text())

	fmt.Print("👤 이름을 입력하세요: ")
	if !scanner.Scan() {
		fmt.Println("❌ 입력 실패")
		return
	}
	firstName := strings.TrimSpace(scanner.Text())

	fmt.Print("👤 성을 입력하세요: ")
	if !scanner.Scan() {
		fmt.Println("❌ 입력 실패")
		return
	}
	lastName := strings.TrimSpace(scanner.Text())

	fmt.Print("🔐 비밀번호를 입력하세요: ")
	if !scanner.Scan() {
		fmt.Println("❌ 입력 실패")
		return
	}
	password := strings.TrimSpace(scanner.Text())

	// 입력 검증
	if email == "" || firstName == "" || lastName == "" || password == "" {
		fmt.Println("❌ 모든 필드를 입력해주세요.")
		return
	}

	// Extension 서버에 사용자 데이터 설정
	server.SetUserData(firstName, lastName, email, password)

	fmt.Printf("\n✅ Extension에 사용자 데이터가 설정되었습니다:\n")
	fmt.Printf("   📧 이메일: %s\n", email)
	fmt.Printf("   👤 이름: %s %s\n", firstName, lastName)
	fmt.Printf("   🔐 비밀번호: %s\n", password)

	fmt.Println("\n🚀 Chrome Extension 사용 준비 완료!")
	fmt.Println("📱 다음 단계를 따라하세요:")
	fmt.Println("   1. https://cursor.com 으로 이동")
	fmt.Println("   2. Extension 팝업에서 '자동 회원가입 시작' 클릭")

	fmt.Print("\n💡 Enter를 누르면 메뉴로 돌아갑니다: ")
	scanner.Scan()

	// 사용자 데이터 클리어
	server.ClearUserData()
	fmt.Println("🧹 Extension 모드를 종료하고 데이터를 클리어했습니다.")
}

// showAccountStats - 계정 통계 정보 표시
func showAccountStats(db *sql.DB) {
	fmt.Println("\n📊 ===== 계정 통계 정보 =====")

	// 총 계정 수
	totalCount, err := CountAccounts(db)
	if err != nil {
		log.Printf("❌ 총 계정 수 조회 실패: %v", err)
		return
	}

	// 미사용 계정 수
	unusedCount, err := CountUnusedAccounts(db)
	if err != nil {
		log.Printf("❌ 미사용 계정 수 조회 실패: %v", err)
		return
	}

	usedCount := totalCount - unusedCount

	fmt.Printf("📈 총 계정 수: %d개\n", totalCount)
	fmt.Printf("✅ 사용된 계정: %d개\n", usedCount)
	fmt.Printf("⚪ 미사용 계정: %d개\n", unusedCount)

	if totalCount > 0 {
		usageRate := float64(usedCount) / float64(totalCount) * 100
		fmt.Printf("📊 사용률: %.1f%%\n", usageRate)
	}

	fmt.Println("=============================")

	// 최근 계정들 표시
	if totalCount > 0 {
		fmt.Println("\n📋 최근 계정 목록 (최대 5개):")
		accounts, err := GetAllAccounts(db)
		if err != nil {
			log.Printf("❌ 계정 목록 조회 실패: %v", err)
			return
		}

		maxDisplay := 5
		if len(accounts) < maxDisplay {
			maxDisplay = len(accounts)
		}

		for i := 0; i < maxDisplay; i++ {
			acc := accounts[i]
			status := "⚪ 미사용"
			if acc.IsUsed {
				status = "✅ 사용됨"
			}
			fmt.Printf("%d. %s (%s %s) - %s\n",
				i+1, acc.AccountMail, acc.FirstName, acc.LastName, status)
		}
	}
}

// showAccountList - 계정 목록 보기
func showAccountList(db *sql.DB) {
	fmt.Println("\n🗄️ ===== 계정 목록 =====")

	accounts, err := GetAllAccounts(db)
	if err != nil {
		log.Printf("❌ 계정 목록 조회 실패: %v", err)
		return
	}

	if len(accounts) == 0 {
		fmt.Println("📋 저장된 계정이 없습니다.")
		return
	}

	fmt.Printf("📋 총 %d개의 계정이 있습니다:\n\n", len(accounts))
	for i, acc := range accounts {
		status := "⚪ 미사용"
		if acc.IsUsed {
			status = "✅ 사용됨"
		}
		fmt.Printf("%d. %s\n", i+1, acc.AccountMail)
		fmt.Printf("   👤 이름: %s %s\n", acc.FirstName, acc.LastName)
		fmt.Printf("   🔐 비밀번호: %s\n", acc.Password)
		fmt.Printf("   📅 생성일: %s\n", acc.CreatedAt.Format("2006-01-02 15:04:05"))
		fmt.Printf("   📊 상태: %s\n", status)
		fmt.Println()
	}
}

// generateRandomName - 랜덤 이름 생성 (5자리 알파벳)
func generateRandomName() string {
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

// generateRandomPassword - 랜덤 비밀번호 생성 (8자리 이상)
func generateRandomPassword() string {
	chars := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%"
	result := make([]byte, 12) // 12자리 비밀번호
	for i := range result {
		result[i] = chars[rand.Intn(len(chars))]
	}
	return string(result)
}
