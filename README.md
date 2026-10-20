# J-TOUR 品牌網站與商城

原生 HTML／CSS／JavaScript 品牌前台，部署於 GitHub Pages；商品、庫存、購物車、付款、物流、訂單及管理員權限交由 Shopify 處理。不在靜態網站內建立假登入或儲存訂單資料。

**預設是展示模式，不能付款。** 品牌文案與商品是範例，正式營運前必須替換，並連接自己的 Shopify 商店。此專案沒有建立商店帳號、開通金流、設定物流或代替商家的法規義務。

## 開發與目錄

需要 Node.js 22 以上與 Python 3（本機預覽）。沒有第三方 npm 依賴，無須安裝套件。

- `npm run dev`：在 `http://localhost:4173` 預覽，不要直接以 `file://` 開啟。
- `npm run check`：JavaScript 語法檢查。
- `npm test`：Node.js 內建測試，使用模擬 API，不會建立真實訂單。
- `npm run build`：清除並重新產生 `dist/`，只複製 `public/`。
- `public/`：唯一部署來源；品牌設定、頁面、樣式及 Shopify API 用戶端。
- `tests/`：商城整合與錯誤處理測試。
- `legacy/`：原 PHP 空白頁、Jekyll 設定及 Disqus／廣告設定，僅封存、不部署。

原街頭藝人連結保留在本文末尾；舊廣告與留言服務不會在新網站載入。

## 商城設定與信任邊界

在 Shopify 建立商店並啟用 Headless 銷售管道，取得 **public Storefront access token**，填入 `public/config.js` 的商店設定。使用原始 `商店名稱.myshopify.com` 網域，而不是任意網址。API 使用有版本的 Storefront GraphQL 端點，升級版本前先執行測試並在測試商店驗收。

public token 會公開在瀏覽器，是受限的 Storefront 憑證，不是後台登入憑證。只授予前台商品／內容讀取與購物車所需權限。**絕不可填入 Admin API token、private Storefront token、付款金鑰或管理員帳密。** 若商店方案不能提供公開 Storefront API，請先完成 Shopify 端配置，不要把私密 token 放入前台替代。

`public/config.js` 主要設定：

| 設定 | 用途 |
| --- | --- |
| `shopDomain` | 原始 `商店名稱.myshopify.com` 網域 |
| `storefrontAccessToken` | 僅限公開 Storefront token |
| `apiVersion` | 預設 `2026-07`，須與用戶端支援版本一致 |
| `checkoutDomain` | 若結帳網址使用自訂主要網域，填入其純網域名稱以明確允許轉址；否則留空 |
| `customerAccountUrl` | 官方託管顧客帳號網址；未設定則不提供查詢入口 |
| `pageHandles.story`／`pageHandles.contact` | Shopify 頁面 handle，留空使用本機品牌文案 |
| `brand` | 品牌名稱、標語、故事、客服信箱／時間與 Instagram |

Shopify Pages 使用 `bodySummary` 純文字摘要，適合短篇品牌介紹與聯絡資訊；長文可能被 Shopify 截短。請授予內容讀取權限，並檢查已發布頁面能透過 Storefront API 讀取。長篇政策請使用 Shopify 託管政策頁，不要把摘要當成完整政策。

1. 建立商品、圖片、規格、價格與庫存，將商品發布到 Headless 管道；設定銷售市場及幣別。
2. 更新品牌名稱、故事、聯絡方式；可使用 Shopify Pages 管理可設定的品牌內容，內容以純文字安全呈現。
3. 啟用 Shopify 客戶帳號，確認訂單查詢入口可以登入自己的商店。
4. 在 Shopify 設定付款方式、物流區域／費率、稅務、退換貨及隱私政策；確認所選金流在營運地區可用。
5. 完成下列上線驗收後，再對外宣告可交易。

商品金額、可售狀態、購物車與結帳網址來自 Shopify。運費、稅額、折扣、最終價格與庫存以 Shopify 結帳結果為準；前台不自行決定付款成功，也不接收卡號。API 故障不會切換成可下單的假商城。

購物車識別資料只用來恢復購物流程，不在瀏覽器儲存顧客資料。共享裝置請清除網站資料；請勿將含購物車識別碼或訂單網址的內容貼入公開 issue／日誌。

## 管理後台與營運

網站的管理入口連到 Shopify 官方後台，認證與授權由 Shopify 執行，並非任何訪客都可編輯的本機後台。

- 商品／圖片／庫存：使用 Shopify Products 及 Inventory。
- 訂單／退款／出貨：使用 Shopify Orders，付款與物流狀態以後台紀錄為準。
- 品牌內容：使用設定的 Shopify Pages；站點固定文字及視覺樣式仍透過程式碼管理。
- 權限：啟用雙因素驗證，依實際方案建立最小權限的員工角色，商品編輯人員不應具有退款或員工管理權限。
- 訂單查詢：顧客前往 Shopify 託管帳號頁面驗證身分，不在公開頁面提供以任意訂單號查詢個資的功能。

本網站不需要付款 webhook；付款結果與履約由 Shopify 記錄。若未來需自行串接 ERP／物流 webhook，必須使用獨立伺服器驗證簽章、去重及存取控管，不可直接放在 GitHub Pages。

## 部署

在 GitHub Settings → Pages 將 Source 設為 **GitHub Actions**。唯一的 `.github/workflows/static.yml` 會在 PR 執行檢查、測試及建置；只有 `main` 分支可部署。請對 `github-pages` environment 設定部署保護，並將驗證工作設為合併前必要檢查。

部署產物只有 `dist/`；不會發布倉庫、測試或封存資料。資源使用相對路徑，支援網域首頁與專案子路徑。若使用自訂網域，須另外設定 DNS、Pages 網域與 HTTPS，並同步更新網站 SEO／商店連結設定。正式品牌的 HTML 標題、meta description 與固定文案也要在 `public/index.html` 更新，不能只修改執行時設定就假設搜尋引擎會同步取得。

回復版本：還原有問題的提交後重新部署，或重跑已驗證版本的 workflow。前台回復不會回復 Shopify 商品、庫存與訂單資料。

## 上線驗收與備份

自動測試僅驗證用戶端整合，**尚未驗證任何真實商店、金流、員工權限或配送服務**。正式上線前在測試商店逐項驗收：

- 未設定時清楚顯示展示模式，不能付款；設定錯誤／斷線時顯示錯誤，不產生假訂單。
- 手機與桌面可瀏覽商品、選擇規格；售罄商品不能加入，鍵盤可操作對話框與購物車。
- 加入、修改數量、移除、重整恢復購物車；網路失敗不會自動重送可能已成功的購物車變更。
- 修改後台價格／庫存後重新操作，確認以 API 與託管結帳結果為準。
- 使用 Shopify 測試付款，分別驗證成功、失敗、取消、庫存不足、運費、稅額及訂單信件；測試完成後再啟用正式付款。
- 登出管理員無法操作後台，受限員工無法執行越權操作；顧客只能查到自己帳號的訂單。
- 確認品牌內容、圖片授權、聯絡資料、SEO、隱私／退貨政策均為正式版本。

備份分為兩部分：前台設定與程式碼由 Git 歷史保存；商店資料依 Shopify 提供的匯出功能定期匯出商品與訂單，另外保存原始圖片與頁面文案，或使用經審查的商店備份服務。備份含顧客資料時必須加密、限制存取並設定保留期限，**不得提交到本公開倉庫**。定期在測試商店演練還原，不能把程式碼備份當成訂單備份。

## 原有街頭藝人資源（保留）

### Yihren self-service portal
### Busking street
- [Search Taiwan on map](https://cloud.culture.tw/frontsite/inquiry/PerformerPlaceAction.do?method=doFindAll)
### Busker application
Where you can apply liscences and street  performance approvements from North to South and West to East.
#### [Taiwan](https://cloud.culture.tw/frontsite/inquiry/cityAndCountyTheme.do?method=view)
- [Keelung, Taipei and Taoyuan](https://busker.culture.tw/member/loginIndex)
  - [Keelung City](https://busker.culture.tw/keelung)
  - [Taipei City](https://busker.culture.tw/taipei)
    - [臺北市信義及西門徒步區街頭藝人從事藝文展演活動申請管理要點](https://www.laws.taipei.gov.tw/Law/LawSearch/LawInformation?sysNumber=P31D3068)
    - [臺北市街頭藝人從事藝文展演活動管理辦法](https://tpbusker.gov.taipei/newscontent.aspx?id=26)
  - [New Taipei City](https://busker.culture.tw/newtaipei)
  - [Taoyuan City](https://busker.culture.tw/taoyuan)
    - [Taoyuan City Backup](https://taobuskers.azurewebsites.net/Home/Index2)
    - [桃園市街頭藝人從事藝文活動管理辦法](https://law.tycg.gov.tw/LawContent.aspx?id=GL002448)
- Hsinchu
  - [Hsinchu County](https://busker.culture.tw/hsinchu)
  - [Hsinchu City](https://busker.culture.tw/hsinchucity)
- [Yilan](https://busker.culture.tw/yilan)
- [Miaoli](https://busker.culture.tw/miaoli)
- [Hualien](https:/busker.culture.tw/hualien)
- [Taichung](https://buskers.taichung.gov.tw/index.php)
- [Changhua](https://busker.culture.tw/changhua)
- [Nantou](https://busker.culture.tw/nantou)
- [Yunlin](https://busker.culture.tw/yunlin)
- Chiayi
  - [Chiayi County](https://busker.culture.tw/chiayi)
  - [Chiayi City](https://busker.culture.tw/chiayicity)
- [Taitung](https://busker.culture.tw/taitung)
- [Tainan](https://buskersapply.tainan.gov.tw)
- [Kaohsiung](https://busker.culture.tw/kaohsiung)
- [Pingtung](https://busker.culture.tw/pingtung)
- [Penghu](https://busker.culture.tw/penghu)

### Busking law
- [噪音管制法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=O0030001)
  - [噪音管制標準](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=O0030006&kw=%e5%99%aa%e9%9f%b3%e7%ae%a1%e5%88%b6)
