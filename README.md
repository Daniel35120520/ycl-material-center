# 材料研發中心｜膠類紀錄與 SPC 平台

由 YCL 開發的材料研發資料管理系統，供膠類配方、製程條件、標準品、DOE 實驗結果及 SPC 品質趨勢追蹤使用。

本專案以 MIT License 開源。你可以複製、修改及部署自己的獨立版本，但請勿把原系統的正式帳號、員工資料或 D1 生產資料一併公開。

## 正式展示

- 正式站：[ycl-material-center.daniellin1212.workers.dev](https://ycl-material-center.daniellin1212.workers.dev/)
- 乾淨開源版：[Daniel35120520/ycl-material-center](https://github.com/Daniel35120520/ycl-material-center)

正式站可能受 Cloudflare Access 保護。建立自己的版本時，請使用自己的 Cloudflare 帳號、Worker 名稱與 D1 資料庫。

## 主要功能

- 帳號申請、登入、啟用及角色分權。
- 依大專案分離 Recipe、黏度轉速、Ti 定義、機台與 SPC 上下限。
- 標準品與多組 DOE 同時填報，標準品可選填。
- 記錄原料配方、機台、製程時間、設定溫度、實際溫度及轉速。
- 自動計算產率、固含量、Ti 與電阻率。
- 專案大盤顯示標準品與實驗組定錨比較。
- 舊資料可事後編輯檢驗數據、機台及多段製程條件。
- SPC 支援 DOE／標準品切換、自訂 Y 軸與大專案篩選。
- SPC 可依生產日期、轉速或任一自訂機台類型分組。
- 主分組用顏色、次分組用形狀區分，顏色可自行調整。
- 首頁依各專案的 USL／LSL 自動列出超規項目。
- CSV 匯出、批次刪除、分支專案及機台管理。
- 所有正式資料持久化儲存在 Cloudflare D1。

## 技術架構

| 層級 | 技術 |
| --- | --- |
| 前端 | React 19、Next.js App Router 相容介面、Vinext |
| 執行環境 | Cloudflare Workers |
| 資料庫 | Cloudflare D1（SQLite 語意） |
| ORM／遷移 | Drizzle ORM、Drizzle Kit |
| 建置 | Vite、Cloudflare Vite Plugin |
| 部署 | Wrangler 4 |
| 套件管理 | pnpm |
| 語言 | TypeScript |

## 系統資料流

```text
使用者瀏覽器
    │
    ▼
Cloudflare Worker／Vinext
    ├── 帳號與 Session API
    ├── 專案、Recipe、機台與 SPC 設定 API
    └── 標準品／DOE 批次資料 API
            │
            ▼
       Cloudflare D1
```

## 權限角色

| 角色 | 用途 |
| --- | --- |
| 最高管理員 | 管理所有頁面、帳號及權限 |
| 部門管理員 | 管理資料、專案與部門使用者 |
| 專案管理員 | 填寫、檢視、編輯與分析專案資料 |
| 操作員 | 主要執行資料填寫 |

全新資料庫的第一位申請者會自動成為最高管理員並立即啟用。之後申請的帳號預設為操作員，必須由管理員啟用及調整角色。

## SPC 與計算方式

### 產率

```text
產率（%）＝100 × 出料重 ÷ 投料總重
```

### 固含量

```text
固含量（%）＝100 ×（乾膠重 − 空鋁盤重）÷ 濕膠重
```

### Ti

每個大專案可自行指定黏度轉速的分子及分母，例如：

```text
Ti＝2 r.p.m 黏度 ÷ 20 r.p.m 黏度
```

### 電阻率

```text
電阻率（Ω-cm）＝平均片電阻 × 平均厚度（mm）× 0.1
```

片電阻的每一組數據可分別選擇科學記號次方。

### 製程能力

系統依現行需求使用以下公式：

```text
σ 帶寬＝6 × MR̄ ÷ 1.128
Cp＝（UCL − LCL）÷ σ 帶寬
Ck＝2 × |（UCL＋LCL）÷ 2 − 原始數據平均值| ÷（UCL − LCL）
Cpk＝Cp ×（1 − Ck）
Z＝3 × Cpk
```

圖表中 `UCL／LCL` 為紅色虛線，`USL／LSL` 為深橘色虛線。少於 20 筆時顯示「暫估」。此平台用於研發與內部製程判讀，不應取代正式品質系統的統計驗證或簽核。

## 專案結構

```text
app/
├── api/auth/          # 帳號、登入、Session 與權限 API
├── api/pairs/         # 標準品與 DOE 批次 API
├── api/projects/      # 專案、Recipe、機台與 SPC 設定 API
├── auth-portal.tsx    # 登入、申請與帳號管理介面
├── page.tsx           # 總覽、填寫、大盤、SPC 與資料管理
└── globals.css        # 全站樣式
db/
├── schema.ts          # D1／SQLite 資料模型
└── index.ts           # Drizzle D1 連線
drizzle/               # 版本化 SQL 遷移
tests/                 # 建置及重要功能回歸測試
worker/                # Cloudflare Worker 入口
wrangler.jsonc         # Worker、Assets 與 D1 綁定
```

## 本機開發

### 必要環境

- Node.js `22.13.0` 以上。
- pnpm。
- Git。

### 安裝與啟動

```powershell
git clone https://github.com/Daniel35120520/ycl-material-center.git
cd ycl-material-center
corepack enable
pnpm install
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

本機資料使用 Wrangler／Miniflare 的本機 D1 狀態，不會自動寫入正式資料庫。

### 品質檢查

```powershell
pnpm test
```

測試命令會先完成正式建置，再執行關鍵功能回歸檢查。

## 建立自己的 GitHub 與 Cloudflare 版本

完整的逐步指令、驗證點、常見錯誤與可直接交給 Codex Agent 的工作提示，請閱讀：

- [CODEX_TRANSFER_AND_DEPLOY.md](./CODEX_TRANSFER_AND_DEPLOY.md)

## 資料庫與隱私

- Git 儲存庫只包含資料表結構及遷移，不包含正式 D1 資料。
- `.env*`、`.dev.vars`、`.wrangler/`、`dist/` 及資料庫匯出檔不應提交。
- `database_id` 是 Cloudflare 資源識別碼，不是密碼；移轉時仍必須換成新帳號建立的 ID。
- 若需移轉正式資料，應先取得資料擁有者授權，並檢查員工姓名、工號、配方與研發數據的機密性。
- 不要把 Cloudflare API Token、GitHub Token、密碼或 Session Cookie 寫入程式碼、Markdown 或 Git 歷史。

## 開發原則

- 各大專案的 Recipe、黏度設定、Ti 定義、機台及 SPC 界線必須獨立。
- 新增機台類型後，資料填寫、舊資料編輯及 SPC 主／次分組應自動連動。
- 資料庫結構變更必須新增 Drizzle migration，不可只修改 `db/schema.ts`。
- 正式發布前至少執行 `pnpm test`。
- 破壞性資料操作前必須先備份 D1 並確認目標帳號與資料庫。

## 授權

本專案採用 [MIT License](./LICENSE.md)。

Copyright © 2026 林昱圻（YCL）。
