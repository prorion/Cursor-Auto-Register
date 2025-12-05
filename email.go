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
	err = page.Goto("https://www.mohmal.com/en", playwright.PageGotoOptions{
		Timeout: playwright.Float(30000), // 30초 타임아웃
	})
	if err != nil {
		log.Fatalf("❌ Mohmal 접속 실패: %v", err)
	}

	// 페이지 로딩 대기
	err = page.WaitForLoadState(playwright.PageWaitForLoadStateOptions{
		State: playwright.LoadStateNetworkidle,
	})
	if err != nil {
		log.Printf("⚠️ 페이지 로딩 대기 중 오류: %v", err)
	}

	// 랜덤 이메일 생성 버튼 클릭
	fmt.Println("📧 새로운 이메일 생성 중...")

	// 여러 가능한 선택자 시도
	selectors := []string{
		"text=Randomly Generate",
		"text=Generate",
		"button:has-text('Generate')",
		"input[type='button'][value*='Generate']",
		".btn:has-text('Generate')",
		"#generate",
	}

	var clicked bool
	for _, selector := range selectors {
		err = page.Click(selector, playwright.PageClickOptions{
			Timeout: playwright.Float(5000),
		})
		if err == nil {
			clicked = true
			break
		}
	}

	if !clicked {
		log.Fatalf("❌ 이메일 생성 버튼을 찾을 수 없습니다")
	}

	// 생성된 이메일 주소 가져오기
	time.Sleep(2 * time.Second) // 이메일 생성 대기

	var email string
	emailSelectors := []string{
		"#email",
		".email-address",
		"input[type='text']",
		"input[readonly]",
		".generated-email",
	}

	for _, selector := range emailSelectors {
		emailElement, err := page.QuerySelector(selector)
		if err == nil && emailElement != nil {
			email, err = emailElement.GetAttribute("value")
			if err != nil || email == "" {
				email, err = emailElement.InnerText()
			}
			if err == nil && email != "" {
				break
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
			err := page.Reload(playwright.PageReloadOptions{
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
