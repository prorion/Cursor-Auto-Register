package main

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

func main() {
	fmt.Println("🚀 Mohmal 임시 이메일 생성 및 인증코드 추출 시작...")

	// Playwright 설치 및 실행
	err := playwright.Install()
	if err != nil {
		log.Fatalf("❌ Playwright 설치 실패: %v", err)
	}

	pw, err := playwright.Run()
	if err != nil {
		log.Fatalf("❌ Playwright 실행 실패: %v", err)
	}
	defer pw.Stop()

	// 브라우저 실행 (헤드리스 모드 비활성화로 디버깅 용이)
	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(false), // 브라우저 창 표시
	})
	if err != nil {
		log.Fatalf("❌ 브라우저 실행 실패: %v", err)
	}
	defer browser.Close()

	// 새 페이지 생성
	page, err := browser.NewPage()
	if err != nil {
		log.Fatalf("❌ 새 페이지 생성 실패: %v", err)
	}

	// Mohmal 웹사이트 접속
	fmt.Println("🌐 Mohmal.com 접속 중...")
	_, err = page.Goto("https://www.mohmal.com/en", playwright.PageGotoOptions{
		Timeout: playwright.Float(30000), // 30초 타임아웃
	})
	if err != nil {
		log.Fatalf("❌ Mohmal 접속 실패: %v", err)
	}

	// 페이지 로딩 대기 //
	err = page.WaitForLoadState(playwright.PageWaitForLoadStateOptions{
		State: playwright.LoadStateNetworkidle,
	})
	if err != nil {
		log.Printf("⚠️ 페이지 로딩 대기 중 오류: %v", err)
	}

	// Random Name 버튼 클릭
	fmt.Println("📧 Random Name 버튼 클릭 중...")

	// Mohmal의 실제 Random Name 버튼 선택자들
	selectors := []string{
		"text=Random Name",
		"button:has-text('Random Name')",
		"input[value='Random Name']",
		"#random-name",
		".random-name",
		"button[onclick*='random']",
		"input[type='button'][value*='Random']",
		"a:has-text('Random Name')",
	}

	var clicked bool
	for _, selector := range selectors {
		fmt.Printf("🔍 선택자 시도: %s\n", selector)
		err = page.Click(selector, playwright.PageClickOptions{
			Timeout: playwright.Float(3000),
		})
		if err == nil {
			fmt.Printf("✅ 버튼 클릭 성공: %s\n", selector)
			clicked = true
			break
		} else {
			fmt.Printf("❌ 실패: %v\n", err)
		}
	}

	if !clicked {
		// 페이지의 모든 버튼과 링크를 출력해서 디버깅
		fmt.Println("🔍 페이지의 모든 버튼과 링크 확인:")
		buttons, _ := page.QuerySelectorAll("button, input[type='button'], input[type='submit'], a")
		for i, button := range buttons {
			text, _ := button.InnerText()
			value, _ := button.GetAttribute("value")
			onclick, _ := button.GetAttribute("onclick")
			fmt.Printf("  %d: 텍스트='%s', value='%s', onclick='%s'\n", i, text, value, onclick)
		}
		log.Fatalf("❌ Random Name 버튼을 찾을 수 없습니다")
	}

	// 생성된 이메일 주소 가져오기
	time.Sleep(3 * time.Second) // 이메일 생성 대기

	var email string
	emailSelectors := []string{
		"#email",
		".email-address",
		"input[type='text']",
		"input[readonly]",
		".generated-email",
		"span.email",
		"div.email",
		".mailbox",
		"#mailbox",
	}

	fmt.Println("🔍 생성된 이메일 주소 찾는 중...")
	for _, selector := range emailSelectors {
		fmt.Printf("🔍 이메일 선택자 시도: %s\n", selector)
		emailElement, err := page.QuerySelector(selector)
		if err == nil && emailElement != nil {
			// value 속성 먼저 확인
			email, err = emailElement.GetAttribute("value")
			if err != nil || email == "" {
				// innerText 확인
				email, err = emailElement.InnerText()
			}
			if err == nil && email != "" && strings.Contains(email, "@") {
				fmt.Printf("✅ 이메일 발견: %s (선택자: %s)\n", email, selector)
				break
			}
		}
	}

	// 이메일을 찾지 못한 경우 모든 요소 확인
	if email == "" {
		fmt.Println("🔍 페이지의 모든 요소에서 @ 포함 텍스트 찾기:")

		// 페이지 전체 텍스트에서 이메일 패턴 찾기
		bodyText, _ := page.InnerText("body")
		lines := strings.Split(bodyText, "\n")
		for i, line := range lines {
			if strings.Contains(line, "@") {
				fmt.Printf("  라인 %d: %s\n", i, strings.TrimSpace(line))
				// 이메일 패턴 추출
				re := regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)
				matches := re.FindAllString(line, -1)
				for _, match := range matches {
					if email == "" {
						email = match
						fmt.Printf("✅ 이메일 패턴 발견: %s\n", match)
					}
				}
			}
		}

		// 추가로 모든 요소 확인
		fmt.Println("🔍 모든 HTML 요소 확인:")
		elements, _ := page.QuerySelectorAll("*")
		for i, element := range elements {
			if i > 100 { // 너무 많으면 제한
				break
			}
			value, _ := element.GetAttribute("value")
			text, _ := element.InnerText()
			if strings.Contains(value, "@") || strings.Contains(text, "@") {
				tagName, _ := element.Evaluate("el => el.tagName")
				className, _ := element.GetAttribute("class")
				id, _ := element.GetAttribute("id")
				fmt.Printf("  %d: <%s> id='%s' class='%s' value='%s' text='%s'\n",
					i, tagName, id, className, value, strings.ReplaceAll(text, "\n", " "))
				if email == "" && value != "" && strings.Contains(value, "@") {
					email = value
				} else if email == "" && text != "" && strings.Contains(text, "@") {
					email = text
				}
			}
		}
	}

	if email == "" {
		log.Fatalf("❌ 생성된 이메일 주소를 찾을 수 없습니다")
	}

	fmt.Printf("✅ 생성된 이메일: %s\n", email)
	fmt.Println("⏳ 이메일 수신 대기 중... (3초마다 확인)")

	// 이메일 수신 확인 (최대 10분)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	checkCount := 0
	for {
		select {
		case <-ctx.Done():
			fmt.Println("⏰ 시간 초과: 10분 내에 새로운 이메일을 받지 못했습니다.")
			return
		case <-ticker.C:
			checkCount++
			fmt.Printf("🔍 이메일 확인 중... (%d번째)\n", checkCount)

			// 페이지 새로고침
			_, err := page.Reload(playwright.PageReloadOptions{
				Timeout: playwright.Float(10000),
			})
			if err != nil {
				log.Printf("⚠️ 페이지 새로고침 실패: %v", err)
				continue
			}

			// 받은 편지함 확인
			time.Sleep(2 * time.Second) // 로딩 대기

			// 이메일 목록 확인
			emailListSelectors := []string{
				".email-list .email-item",
				".inbox .email",
				".message",
				"tr[onclick]",
				".mail-item",
			}

			var emails []playwright.ElementHandle
			for _, selector := range emailListSelectors {
				emails, err = page.QuerySelectorAll(selector)
				if err == nil && len(emails) > 0 {
					break
				}
			}

			if len(emails) > 0 {
				fmt.Printf("📬 새로운 이메일 발견! (%d개)\n", len(emails))

				// 첫 번째 이메일 클릭
				err = emails[0].Click()
				if err != nil {
					log.Printf("⚠️ 이메일 클릭 실패: %v", err)
					continue
				}

				time.Sleep(2 * time.Second) // 이메일 로딩 대기

				// 이메일 내용 가져오기
				var content string
				contentSelectors := []string{
					"#email-body",
					".email-content",
					".message-body",
					".mail-content",
					"iframe",
				}

				for _, selector := range contentSelectors {
					element, err := page.QuerySelector(selector)
					if err == nil && element != nil {
						if selector == "iframe" {
							// iframe 내용 처리
							frame, err := element.ContentFrame()
							if err == nil {
								content, err = frame.InnerText("body")
								if err == nil && content != "" {
									break
								}
							}
						} else {
							content, err = element.InnerText()
							if err == nil && content != "" {
								break
							}
						}
					}
				}

				if content == "" {
					// 페이지 전체에서 텍스트 검색
					content, _ = page.InnerText("body")
				}

				fmt.Printf("📄 이메일 내용:\n%s\n", content)

				// 인증코드 추출
				code := extractVerificationCode(content)
				if code != "" {
					fmt.Printf("🎯 인증코드 발견: %s\n", code)
					return
				} else {
					fmt.Println("❌ 인증코드를 찾을 수 없습니다.")
					fmt.Println("🔄 계속 대기 중...")
				}
			}
		}
	}
}

// 이메일 내용에서 인증코드 추출
func extractVerificationCode(content string) string {
	// 다양한 인증코드 패턴 정규표현식
	patterns := []string{
		`(?i)verification\s*code[:\s]*([A-Z0-9]{4,8})`, // verification code: ABC123
		`(?i)confirm\s*code[:\s]*([A-Z0-9]{4,8})`,      // confirm code: ABC123
		`(?i)auth\s*code[:\s]*([A-Z0-9]{4,8})`,         // auth code: ABC123
		`(?i)code[:\s]*([A-Z0-9]{4,8})`,                // code: ABC123
		`\b([A-Z0-9]{6})\b`,                            // 6자리 대문자/숫자 조합
		`\b([0-9]{4,8})\b`,                             // 4-8자리 숫자
		`(?i)your\s+code\s+is[:\s]*([A-Z0-9]{4,8})`,    // your code is ABC123
		`(?i)enter\s+code[:\s]*([A-Z0-9]{4,8})`,        // enter code ABC123
	}

	content = strings.ReplaceAll(content, "\n", " ")
	content = strings.ReplaceAll(content, "\t", " ")

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(content)
		if len(matches) > 1 {
			code := strings.TrimSpace(matches[1])
			if len(code) >= 4 && len(code) <= 8 {
				return code
			}
		}
	}

	// 추가 패턴: 숫자만 있는 경우
	re := regexp.MustCompile(`\b(\d{4,8})\b`)
	matches := re.FindAllString(content, -1)
	for _, match := range matches {
		if len(match) >= 4 && len(match) <= 8 {
			return match
		}
	}

	return ""
}
