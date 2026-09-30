# Codex Agent 移轉與部署手冊

本文件提供給要把「材料研發中心｜膠類紀錄與 SPC 平台」複製到自己 GitHub 與 Cloudflare 帳號的同事，以及協助執行工作的 Codex Agent。

## 移轉目標

完成後，同事應擁有：

1. 自己帳號下的 GitHub 儲存庫。
2. 自己 Cloudflare 帳號下的 Worker。
3. 自己 Cloudflare 帳號下的全新 D1 資料庫。
4. 自己的 `*.workers.dev` 正式網址。
5. 自己建立的第一位最高管理員帳號。

預設採「只移轉程式碼、建立空白資料庫」模式。除非資料擁有者明確授權，禁止複製原系統的正式帳號、配方、DOE 或員工資料。

---

## 可直接貼給 Codex Agent 的任務提示

```text
請閱讀專案根目錄的 README.md、CODEX_TRANSFER_AND_DEPLOY.md、package.json、wrangler.jsonc、db/schema.ts 與 drizzle/ 全部 migration。

目標：把這套膠類紀錄系統部署到我的 GitHub 與 Cloudflare 帳號，建立獨立 Worker 及全新 D1，不可連接或修改原作者的正式 D1。

要求：
1. 先檢查 Git working tree 與敏感資料，不要提交 .env、Token、密碼、資料庫備份、dist 或 .wrangler。
2. 確認 GitHub CLI、Node.js、pnpm 與 Wrangler 可用及已登入。
3. 在我的 GitHub 帳號建立新的儲存庫並推送原始碼。
4. 在我的 Cloudflare 帳號建立新的 D1。
5. 把 wrangler.jsonc 的 Worker name、database_name、database_id 換成我新建立的資源；binding 必須維持 DB。
6. 對新 D1 依序套用 drizzle/ migrations。
7. 執行 pnpm test，成功後才可部署。
8. 使用 pnpm exec wrangler deploy 發布，回報正式網址。
9. 驗證 /api/auth/status 可回應 JSON，並提醒我在網頁建立第一位最高管理員。
10. 未經我確認，不可刪除 Worker、D1、GitHub 儲存庫或匯入原正式資料。

工作中遇到需要登入或瀏覽器授權時，停在授權頁讓我操作；授權完成後繼續。最後列出 GitHub URL、Worker URL、D1 名稱、測試結果與尚未完成事項。
```

---

## 一、準備帳號與工具

同事需要 GitHub 帳號、Cloudflare 帳號、Git、GitHub CLI `gh`、Node.js `22.13.0` 以上及 pnpm。

```powershell
git --version
gh --version
node --version
pnpm --version
pnpm exec wrangler --version
```

Wrangler 應為 `4.x`。本專案已把 Wrangler 放在 `devDependencies`，執行 `pnpm install` 後不需要全域安裝。

登入 GitHub：

```powershell
gh auth login
gh auth status
```

登入 Cloudflare：

```powershell
pnpm exec wrangler login
pnpm exec wrangler whoami
```

瀏覽器出現授權頁時，應由帳號擁有者本人完成授權。

---

## 二、取得程式碼

### 方法 A：Fork（推薦）

在 GitHub 原始儲存庫按 **Fork**，接著複製自己的 Fork：

```powershell
git clone https://github.com/<你的 GitHub 帳號>/<你的儲存庫名稱>.git
cd <你的儲存庫名稱>
```

Fork 適合保留與原始專案的來源關係，日後也可同步更新。

### 方法 B：建立完全獨立的儲存庫

```powershell
git clone https://github.com/Daniel35120520/ycl-material-center.git material-rd-center
cd material-rd-center
git remote rename origin upstream
gh repo create <你的 GitHub 帳號>/<你的儲存庫名稱> --private --source . --remote origin --push
git remote -v
```

建議先使用 Private repository。確認公司資料政策及授權後，再決定是否公開。

---

## 三、安裝與安全檢查

```powershell
corepack enable
pnpm install
git status --short
git ls-files | Select-String -Pattern '\.env|\.dev\.vars|\.pem$|\.key$|backup.*\.sql$'
```

最後一個命令正常情況不應列出任何敏感檔案。

---

## 四、建立自己的 D1 資料庫

先決定不重複的名稱，例如：

```text
Worker：your-material-center
D1：your-material-center-db
```

建立 D1：

```powershell
pnpm exec wrangler d1 create your-material-center-db
```

成功後會取得新資料庫的 `database_id`。它必須來自同事自己的 Cloudflare 帳號。

### 修改 wrangler.jsonc

```jsonc
{
  "name": "your-material-center",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "your-material-center-db",
      "database_id": "貼上新建立的 database_id",
      "migrations_dir": "drizzle"
    }
  ]
}
```

注意：

- `binding` 必須維持 `DB`，程式碼使用 `env.DB`。
- `database_id` 不可沿用原作者的值。
- `name` 會影響正式 `workers.dev` 網址，必須在自己的 Cloudflare 帳號中保持唯一。
- 不需要修改 `main`、`assets` 或 `migrations_dir`。

---

## 五、建立 D1 資料表

```powershell
pnpm exec wrangler d1 migrations list your-material-center-db --remote
pnpm exec wrangler d1 migrations apply your-material-center-db --remote
pnpm exec wrangler d1 migrations list your-material-center-db --remote
```

確認主要資料表存在：

```powershell
pnpm exec wrangler d1 execute your-material-center-db --remote --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
```

至少應包含：

- `users`
- `sessions`
- `projects`
- `branches`
- `machines`
- `submission_groups`
- `batches`
- `spc_limits`
- `audit_logs`
- `d1_migrations`

Cloudflare 在套用 migration 時會建立備份。任何 migration 失敗時先停止部署，不要手動略過錯誤。

---

## 六、本機測試與建置

```powershell
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

另開一個終端執行：

```powershell
pnpm test
```

只有 `pnpm test` 全部成功後才能正式發布。

---

## 七、第一次發布 Cloudflare Worker

```powershell
pnpm exec wrangler deploy
```

成功訊息會包含正式網址：

```text
https://your-material-center.<你的 workers.dev 子網域>.workers.dev
```

測試狀態 API：

```powershell
Invoke-RestMethod https://your-material-center.<你的 workers.dev 子網域>.workers.dev/api/auth/status
```

空白新系統應回傳尚未初始化、沒有登入使用者的 JSON，而不是 HTML 錯誤頁。

---

## 八、建立第一位最高管理員

1. 開啟新 Worker 網址。
2. 系統顯示「建立第一位最高管理員」。
3. 輸入工號、姓名、部門及密碼。
4. 密碼至少 10 碼，並同時包含英文字母與數字。
5. 建立成功後用工號及密碼登入。
6. 到資料管理頁建立第一個大專案、分支、機台、Recipe 與 SPC 界線。

全新 D1 的第一位申請者會自動成為 `super_admin`。正式網址發布後，不要長時間保持未初始化狀態，應立即由系統負責人建立最高管理員。

---

## 九、提交設定並推送 GitHub

```powershell
git status --short
git diff --check
git add wrangler.jsonc
git commit -m "Configure independent Cloudflare deployment"
git push origin main
```

禁止提交：

- `.env`、`.env.local`、`.dev.vars`。
- Cloudflare API Token、GitHub Token 或密碼。
- `.wrangler/`、`dist/`、`node_modules/`。
- D1 匯出檔或含正式資料的 SQL。
- 瀏覽器 Cookie、Session Token 或員工帳密。

---

## 十、選用：以 Cloudflare Access 限制 Email

應用程式本身已有帳密及角色權限。若還要在網站外層限制指定公司 Email：

1. 進入 Cloudflare Zero Trust。
2. 選擇 **Access → Applications**。
3. 新增 Self-hosted application。
4. 填入 Worker 的正式網域。
5. 建立 Allow policy。
6. Include 選擇指定 Email、Email domain 或公司 IdP 群組。
7. 驗證允許名單可登入、非允許名單被阻擋。

Access 是網站外層的第一道門，系統內帳號是第二道門。兩者用途不同，不應移除系統內的帳號及角色控管。

---

## 十一、選用：移轉既有資料

只有在資料擁有者明確授權後才可執行。

```powershell
pnpm exec wrangler d1 export <來源 D1 名稱> --remote --output authorized-backup.sql
```

匯入前必須：

- 確認員工姓名、工號、配方與 DOE 允許移轉。
- 確認來源與目標 schema 版本相同。
- 先備份目標 D1。
- 不把 `authorized-backup.sql` 加入 Git。
- 再次確認目標 Cloudflare 帳號與 D1 名稱。

資料匯入屬於高風險操作，Codex Agent 不可在只有「移轉程式」的指示下自行執行。

---

## 十二、日後更新流程

```powershell
git pull --ff-only
pnpm install
pnpm test
git status --short
git add <本次檔案>
git commit -m "Describe the change"
git push origin main
pnpm exec wrangler deploy
```

若修改 `db/schema.ts`：

```powershell
pnpm db:generate
pnpm exec wrangler d1 migrations apply your-material-center-db --remote
```

檢查新產生的 `drizzle/*.sql` 後再套用。資料庫 migration 應先套用，再部署會依賴新欄位的程式版本。

---

## 十三、驗收清單

### GitHub

- [ ] 儲存庫位於同事自己的 GitHub 帳號。
- [ ] `origin` 指向同事自己的儲存庫。
- [ ] Git 未追蹤密碼、Token、`.env` 或資料庫備份。
- [ ] `main` 已推送且 working tree 乾淨。

### Cloudflare

- [ ] `wrangler whoami` 顯示同事自己的帳號。
- [ ] Worker 名稱與原系統不同。
- [ ] D1 名稱及 `database_id` 都屬於同事自己的帳號。
- [ ] 所有 migration 已套用。
- [ ] `pnpm test` 成功。
- [ ] `wrangler deploy` 成功並取得正式網址。

### 應用程式

- [ ] 第一位最高管理員已建立。
- [ ] 可以登入及登出。
- [ ] 可以新增大專案、分支與自訂機台類型。
- [ ] Recipe 模板能帶入資料填寫。
- [ ] 可以新增標準品／DOE，並在專案大盤看到資料。
- [ ] SPC 可以選擇專案、DOE／標準品及動態機台分組。
- [ ] 超出 USL／LSL 的資料會出現在首頁「需要工程師介入」。
- [ ] 編輯、刪除與 CSV 匯出功能正常。

---

## 十四、常見問題

### Wrangler 顯示未登入

```powershell
pnpm exec wrangler login
pnpm exec wrangler whoami
```

### 找不到 D1 binding `DB`

檢查 `wrangler.jsonc`：

- `d1_databases[0].binding` 是否為 `DB`。
- `database_id` 是否為新 D1 的 ID。
- 執行命令的位置是否為專案根目錄。

### 網站可以開啟，但新增資料失敗

```powershell
pnpm exec wrangler d1 migrations list your-material-center-db --remote
pnpm exec wrangler tail your-material-center
```

### 第一位使用者沒有成為最高管理員

代表該 D1 的 `users` 表中已有資料。先確認是否誤連其他資料庫，不要直接刪除帳號。若是誤用的全新測試 D1，可在確認目標與備份後重建新的 D1。

### Worker 名稱已存在

修改 `wrangler.jsonc` 的 `name`，使用自己帳號中唯一的名稱，再重新部署。

### GitHub 推送失敗

```powershell
gh auth status
git remote -v
```

確認登入帳號及 `origin` 都是同事自己的資源。

---

## 官方文件

- [Cloudflare D1 入門](https://developers.cloudflare.com/d1/get-started/)
- [Wrangler D1 指令](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Workers Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub CLI 手冊](https://cli.github.com/manual/)

完成上述流程後，新系統與原作者的 GitHub、Worker 及 D1 彼此獨立；同事可以交由自己的 Codex Agent 繼續維護。
