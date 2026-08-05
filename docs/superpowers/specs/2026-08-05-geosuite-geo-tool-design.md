# GeoSuite — Thiết kế công cụ GEO tích hợp hệ sinh thái Marketing

Ngày: 2026-08-05
Trạng thái: Đã duyệt thiết kế, chờ lập kế hoạch triển khai

## 1. Bối cảnh và mục tiêu

Người dùng ngày càng tìm câu trả lời trực tiếp từ ChatGPT, Perplexity, Gemini và Google AI Overviews thay vì duyệt danh sách kết quả tìm kiếm. Với doanh nghiệp, điều này tạo ra một khoảng mù: các công cụ SEO hiện có không cho biết thương hiệu có được AI nhắc đến hay không, được nhắc như thế nào, và AI có nói đúng về sản phẩm hay không.

GeoSuite là nền tảng SaaS multi-tenant giải quyết ba việc, theo đúng thứ tự nhân quả:

1. **Đo lường** mức độ hiển thị của thương hiệu trong câu trả lời của các AI engine.
2. **Tối ưu** nội dung để tăng khả năng được AI trích dẫn, dựa trên dữ liệu đo được.
3. **Phân phối** dữ liệu và tín hiệu GEO vào hệ sinh thái marketing sẵn có của doanh nghiệp.

Phần thứ ba là điểm khác biệt: GeoSuite không đặt mục tiêu thay thế công cụ marketing hiện có mà nối vào chúng. Dữ liệu GEO chỉ có giá trị khi nằm cạnh dữ liệu traffic, nội dung và khách hàng.

### Phạm vi không bao gồm

- Kiểm tra kỹ thuật AI-readiness của website (robots.txt cho AI bot, llms.txt, tốc độ render). Đã cân nhắc và loại khỏi phiên bản này.
- Tự động xuất bản nội dung. Hệ thống chỉ tạo bản nháp; con người duyệt và xuất bản.

### Tiêu chí thành công

- Một brand cấu hình xong và có dữ liệu hiển thị đầu tiên trong vòng 30 phút kể từ khi đăng ký.
- Chỉ số hiển thị hằng ngày ổn định, có ghi nhận độ phủ để không so sánh nhầm giữa các ngày.
- Chứng minh được tác động: với mỗi đề xuất đã áp dụng, báo cáo thay đổi chỉ số trong 30 ngày kế tiếp.
- Chi phí LLM cho mỗi brand nằm trong hạn mức đã định, có thể theo dõi theo thời gian thực.

## 2. Quyết định nền tảng

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Mô hình triển khai | SaaS multi-tenant | Chi phí gọi AI chia được cho nhiều khách; connector viết một lần dùng cho tất cả |
| Nguồn dữ liệu | API chính thức của nhà cung cấp LLM + SERP provider bên thứ ba (SerpApi hoặc DataForSEO) cho AI Overviews | Hợp pháp, ổn định, chi phí dự đoán được. Scraping giao diện người dùng bị loại vì rủi ro điều khoản dịch vụ và độ giòn |
| Kiến trúc | Modular monolith + worker riêng | Workload là batch chạy dài, có trạng thái chia sẻ (hạn mức, rate-limit, chi phí) — phù hợp worker thường trú hơn serverless |
| Ngôn ngữ | TypeScript toàn bộ | Một bộ type dùng chung giữa API và UI; SDK marketing (GA4, HubSpot, Contentful) đều có sẵn cho Node |
| Lưu trữ | PostgreSQL + Redis | Postgres làm nguồn dữ liệu duy nhất; Redis cho hàng đợi và rate-limit |

### Phương án đã cân nhắc và loại bỏ

**Microservices.** Cô lập lỗi và scale tốt hơn, nhưng đòi hỏi service mesh, distributed tracing và đồng bộ schema giữa các service — chi phí vận hành không tương xứng khi chưa có tải thật. Ranh giới package trong phương án đã chọn giữ cửa mở để tách dần về sau.

**Serverless / event-driven.** Ít việc hạ tầng nhất, nhưng khi mỗi tenant chạy hàng nghìn lệnh gọi LLM mỗi ngày, chi phí theo lượt gọi vượt chi phí worker chạy liên tục khá nhanh. Quan trọng hơn, việc kiểm soát rate-limit chung cho toàn hệ thống trở nên khó vì các function không chia sẻ trạng thái.

**Chỉ dùng API chính thức, không mua SERP.** Rẻ và đơn giản hơn, nhưng bỏ sót Google AI Overviews — kênh có lưu lượng lớn nhất ở nhiều thị trường.

## 3. Kiến trúc

```
apps/
  web/                 Next.js (App Router) — dashboard, REST API, OAuth callback
  worker/              Node — BullMQ consumer + scheduler
packages/
  db/                  Drizzle schema, migration, repository
  engines/             Adapter cho từng AI engine
  extraction/          Bóc tách tín hiệu từ câu trả lời AI
  scoring/             Tính chỉ số hiển thị
  probe-engine/        Điều phối một lần chạy đo lường
  content-analyzer/    Chấm điểm và đề xuất tối ưu nội dung
  connectors/          Framework tích hợp và các adapter
  shared/              Type, zod schema, tiện ích chung
```

### Ranh giới module

Bốn quy tắc dưới đây quyết định việc hệ thống có giữ được sự rõ ràng khi lớn lên hay không.

**Chỉ `db` được viết SQL.** Mọi package khác nhận vào repository interface. Đổi cách lưu trữ không lan sang logic nghiệp vụ.

**`engines` không biết gì về thương hiệu hay tenant.** Mỗi adapter chỉ nhận prompt và trả về `EngineResponse { text, citations[], model, latency, tokenUsage }`. Thêm engine mới là viết một file, không sửa chỗ nào khác.

**`extraction` và `scoring` là hàm thuần.** Chúng chứa phần lớn logic nghiệp vụ và test được toàn bộ bằng fixture, không cần mạng, không cần cơ sở dữ liệu. Đây là lý do chúng tách khỏi `probe-engine`.

**`probe-engine` chỉ điều phối.** Nó lấy prompt, gọi `engines`, đưa kết quả qua `extraction`, ghi qua `db`. Bản thân nó gần như không chứa logic.

### Luồng dữ liệu chính

```
Scheduler → hàng đợi probe → worker
  → engines (gọi API, rate-limit theo nhà cung cấp)
  → extraction (hàm thuần)
  → db (lưu câu trả lời thô + quan sát đã chuẩn hoá)
  → scoring (tổng hợp theo ngày)
  → connectors (đẩy ra GA4 / CRM / Slack / webhook)
```

## 4. Mô hình dữ liệu

### Tenant và phân quyền

`organizations`, `users`, `memberships` (owner / admin / editor / viewer), `brands`.

Một org có nhiều brand ngay từ đầu. Đây là điều kiện cần cho khách hàng agency, và thêm sau sẽ đòi hỏi migration đau đớn trên toàn bộ dữ liệu.

### Cấu hình theo dõi

- `brand_profiles` — tên chính, các biến thể tên, domain, mô tả entity, bộ dữ kiện dùng để đối chiếu độ chính xác
- `competitors` — đối thủ theo dõi cùng
- `prompts` — câu hỏi theo dõi, kèm chủ đề, giai đoạn phễu, ngôn ngữ, thị trường
- `engine_configs` — bật/tắt từng engine cho mỗi brand

### Dữ liệu đo lường

- `probe_runs` — một lần chạy theo lịch; có trạng thái, tiến độ và **độ phủ**
- `probe_results` — câu trả lời thô của mỗi cặp (prompt × engine), lưu nguyên văn để chạy lại extraction khi thuật toán cải tiến. Bảng lớn nhất: chia partition theo tháng, chuyển sang object storage sau 90 ngày
- `observations` — kết quả đã chuẩn hoá: có được nhắc không, vị trí, sắc thái, đối thủ xuất hiện cùng
- `citations` — từng URL được trích dẫn, có cờ đánh dấu thuộc domain của brand
- `daily_metrics` — bảng tổng hợp sẵn cho dashboard, tránh quét bảng thô

### Nội dung

`content_assets` (đồng bộ từ CMS, có phiên bản), `content_audits`, `recommendations`.

### Tích hợp và vận hành

- `connector_accounts` — token OAuth mã hoá bằng KMS, không lưu plaintext
- `sync_jobs` — trạng thái và checkpoint đồng bộ
- `alert_rules`, `alert_events`
- `usage_records` — token và chi phí từng lệnh gọi, quy về org

### Cô lập tenant

Mọi bảng nghiệp vụ mang `org_id`. Phòng thủ hai lớp:

1. Repository luôn nhận `org_id` bắt buộc trong chữ ký hàm.
2. Bật Row-Level Security ở Postgres.

Lớp thứ hai tồn tại vì lớp thứ nhất sẽ có lúc bị quên. Với sản phẩm multi-tenant, rò rỉ dữ liệu chéo là lỗi không thể chấp nhận.

## 5. Động cơ đo lường

### Các engine hỗ trợ

| Engine | Nguồn | Giai đoạn |
|---|---|---|
| ChatGPT (có web search) | OpenAI API | 1 |
| Perplexity | Perplexity API | 1 |
| Google Gemini (có grounding) | Gemini API | 1 |
| Google AI Overviews | SerpApi hoặc DataForSEO | 1 |
| Claude, Copilot, Google AI Mode | Bổ sung sau | Sau giai đoạn 1 |

Bốn engine đầu nằm trong giai đoạn 1 vì chúng phủ phần lớn lưu lượng thực tế. Nhờ ranh giới của `engines`, việc bổ sung engine mới là thêm một file adapter, không ảnh hưởng phần còn lại.

### Vòng đời một lần chạy

Scheduler tạo `probe_run` theo lịch của từng brand (hằng ngày hoặc hằng tuần tuỳ gói), rồi fan-out thành các job nhỏ — mỗi job là một bộ ba (prompt × engine × thị trường). Chia nhỏ đến mức này để một engine hỏng không kéo đổ cả lần chạy, và để retry chỉ tốn đúng phần thất bại.

Mỗi job thực hiện tuần tự:

1. Kiểm tra hạn mức của org
2. Xin token từ bộ rate-limit dùng chung (token bucket trên Redis, cấu hình riêng cho từng nhà cung cấp)
3. Gọi adapter engine
4. Lưu câu trả lời thô
5. Chạy `extraction`
6. Ghi `observations` và `citations`
7. Ghi `usage_records`

Khi mọi job của một run kết thúc, một job tổng hợp chạy `scoring`, ghi `daily_metrics`, đối chiếu `alert_rules`, và kích hoạt connector đẩy dữ liệu ra ngoài.

### Bóc tách tín hiệu

Đây là phần khó nhất về mặt kỹ thuật. Nhận diện thương hiệu không thể chỉ so khớp chuỗi: "Viettel" và "Viettel Telecom" là một thực thể, còn "Apple" trong câu về hoa quả thì không phải thương hiệu.

Thiết kế hai tầng:

1. **Tầng lọc** — khớp theo từ điển biến thể tên để tìm ứng viên. Nhanh, rẻ, chạy trên mọi câu trả lời.
2. **Tầng xác nhận** — một lệnh gọi LLM có structured output để xác nhận ngữ cảnh, sắc thái và vị trí. Chỉ chạy khi tầng một tìm thấy ứng viên.

Cách này giữ chi phí ở mức chấp nhận được mà không hy sinh độ chính xác.

### Bộ chỉ số

| Chỉ số | Định nghĩa |
|---|---|
| Visibility Rate | Phần trăm số prompt mà thương hiệu được nhắc đến |
| Share of Voice | Tỷ lệ lần nhắc của brand trên tổng lần nhắc (brand + đối thủ) |
| Citation Rate | Phần trăm câu trả lời có dẫn link về domain của brand |
| Average Position | Vị trí trung bình khi được nhắc trong câu trả lời |
| Sentiment Score | Sắc thái trung bình khi được nhắc |
| Accuracy Flags | Số lần AI nói sai về thương hiệu, đối chiếu với bộ dữ kiện do khách khai báo |

Chỉ số cuối là điểm khác biệt so với công cụ SEO truyền thống. Khi AI trả lời sai về sản phẩm hoặc giá, đó là vấn đề cần xử lý ngay chứ không phải một thứ hạng cần cải thiện dần. Nó cũng là đầu vào ưu tiên cao nhất cho phần đề xuất nội dung.

## 6. Tối ưu nội dung

Phần này trả lời câu hỏi "biết rồi thì làm gì". Nếu thiếu, GeoSuite chỉ là một bảng số liệu.

**Nguồn nội dung.** Đồng bộ từ CMS qua connector, hoặc nhập URL / sitemap thủ công. Mỗi trang thành một `content_asset` có phiên bản, để so sánh được trước và sau khi chỉnh sửa.

**Chấm điểm.** Mỗi asset được đánh giá trên bốn trục:

- *Cấu trúc* — tiêu đề có trả lời thẳng một câu hỏi không
- *Độ rõ entity* — LLM có xác định được đây là trang của ai, về sản phẩm nào không
- *Dữ liệu có cấu trúc* — schema.org phù hợp loại nội dung
- *Độ trích dẫn được* — câu văn có tự chứa nghĩa khi bị cắt khỏi ngữ cảnh không, có số liệu và nguồn không

Trục cuối quan trọng nhất. LLM trích từng đoạn rời rạc, nên một câu chỉ có nghĩa khi đọc cả đoạn trước đó sẽ không bao giờ được dẫn.

**Phân tích khoảng trống.** Đây là chỗ hai hệ thống nối vào nhau. Lấy các prompt mà thương hiệu không xuất hiện, đối chiếu với nội dung hiện có, và phân loại thành hai nhóm: đã có trang phù hợp nhưng chưa được trích (cần sửa), hoặc chưa có nội dung nào phủ chủ đề đó (cần viết mới). Các trường hợp `accuracy_flag` được ưu tiên cao nhất, vì AI đang nói sai chứ không phải chỉ im lặng.

**Đề xuất.** Mỗi đề xuất là một bản ghi có trạng thái (mới / đã chấp nhận / đã áp dụng / bỏ qua), nội dung sửa cụ thể, và lý do gắn với prompt cụ thể. Với CMS có hỗ trợ ghi, đẩy thành bản nháp. Người dùng vẫn là người duyệt và xuất bản; hệ thống không tự đăng.

**Đo tác động.** Khi một đề xuất được đánh dấu đã áp dụng, hệ thống ghi mốc thời gian và theo dõi các prompt liên quan trong 30 ngày kế tiếp, báo cáo thay đổi chỉ số. Đây là vòng lặp khép kín, và cũng là bằng chứng duy nhất cho thấy công cụ có tác dụng thật.

## 7. Khung tích hợp

Bốn tích hợp yêu cầu thực chất chỉ làm ba việc: **đọc** dữ liệu về, **ghi** dữ liệu ra, và **báo** khi có sự kiện. Thay vì viết bốn tích hợp riêng, định nghĩa một interface chung và mỗi connector khai báo năng lực nó hỗ trợ:

```ts
interface Connector {
  id: string
  auth: OAuth2Config | ApiKeyConfig
  capabilities: ('pull' | 'push' | 'notify')[]
  pull?(account: ConnectorAccount, since: Date): AsyncIterable<Record>
  push?(account: ConnectorAccount, payload: PushPayload): Promise<PushResult>
  notify?(account: ConnectorAccount, event: GeoEvent): Promise<void>
}
```

Phần vất vả — làm mới token, checkpoint đồng bộ, retry, ghi nhận lỗi, giao diện quản lý kết nối — nằm ở framework và chỉ viết một lần. Thêm connector thứ năm về sau chỉ là một file.

| Connector | Năng lực | Việc cụ thể |
|---|---|---|
| Search Console | pull | Đối chiếu hiển thị AI với truy vấn và click hữu cơ |
| GA4 | pull, push | Đọc referral từ chatgpt.com / perplexity.ai; đẩy sự kiện GEO qua Measurement Protocol |
| CMS (WordPress, Webflow, Contentful) | pull, push | Đọc nội dung để phân tích; đẩy đề xuất về dạng bản nháp |
| CRM (HubSpot, Salesforce) | push | Gắn nguồn AI vào lead, đồng bộ tín hiệu vào hồ sơ khách hàng |
| Slack / Email | notify | Cảnh báo tụt hạng, đối thủ vượt lên, AI trả lời sai |
| Webhook + REST API | notify, pull | Để khách tự nối vào BI hoặc stack riêng |

### Hai nguyên tắc về lỗi

**Connector hỏng không được ảnh hưởng đo lường.** Chúng chạy trong hàng đợi riêng, retry với backoff tăng dần. Một CRM sập không làm hỏng lần probe.

**Mất kết nối phải hiện rõ.** Token OAuth hết hạn là chuyện thường xuyên. Khi refresh thất bại, tài khoản chuyển trạng thái "cần kết nối lại", hiện cảnh báo trên dashboard và gửi email — chứ không im lặng ngừng đồng bộ. Dữ liệu cũ giữ nguyên, chỉ dừng cập nhật.

## 8. Kiểm soát chi phí

Lệnh gọi LLM chiếm gần như toàn bộ chi phí biến đổi, nên nó là công dân hạng nhất trong thiết kế chứ không phải thứ tính sau.

Mỗi lệnh gọi ghi token và thành tiền vào `usage_records`, quy về org. Mỗi org có hạn mức; chạm ngưỡng thì dừng probe và cảnh báo, không bao giờ âm thầm tiêu vượt.

**Dùng chung câu trả lời thô giữa các tenant.** Nhiều khách hàng cùng ngành sẽ theo dõi những câu hỏi giống nhau. Khoá cache là `hash(prompt, engine, model_version, locale, ngày)` — một lệnh gọi phục vụ mọi tenant theo dõi cùng câu hỏi đó, còn `extraction` vẫn chạy riêng cho từng brand.

Việc này không gây rò rỉ: câu trả lời của AI cho một câu hỏi thị trường chung không phải dữ liệu riêng của tenant nào, và danh sách prompt của mỗi tenant vẫn kín. Khách enterprise cần tuyệt đối riêng biệt có thể tắt tính năng này ở cấp gói.

## 9. Xử lý lỗi

Job thất bại retry ba lần với backoff tăng dần rồi đánh dấu hỏng. Lần chạy vẫn hoàn tất với phần dữ liệu thu được.

**Độ phủ là bắt buộc.** Mỗi `probe_run` lưu tỷ lệ job thành công, và dashboard không được vẽ chỉ số của ngày độ phủ 60% ngang hàng với ngày độ phủ 100%. So sánh hai con số tính trên hai mẫu khác nhau là cách âm thầm tạo ra kết luận sai.

Câu trả lời thô luôn được lưu trước khi extraction chạy. Lỗi extraction chỉ cần chạy lại, không mất dữ liệu.

## 10. Chiến lược kiểm thử

| Phạm vi | Cách kiểm thử |
|---|---|
| `extraction`, `scoring` | Unit test trên bộ fixture là câu trả lời AI thật đã lưu, có nhãn kỳ vọng. Hàm thuần nên test nhanh và tất định |
| `engines`, `connectors` | Contract test với HTTP đã ghi lại, kèm bộ smoke test gọi API thật chạy riêng theo lịch |
| `db` | Test tích hợp trên Postgres thật qua testcontainers |
| Luồng chính | Playwright |

Trọng tâm đặt vào `extraction` và `scoring` vì đó là nơi chứa logic khó và dễ sai nhất.

Một bài test bắt buộc: org A truy vấn dữ liệu org B phải trả về rỗng, kể cả khi repository bị gọi sai. Đây là bài test bảo vệ lớp RLS.

## 11. Lộ trình

Mỗi giai đoạn ra được thứ dùng được ngay.

1. **Đo lường** — auth, tenant, engines, extraction, scoring, dashboard. Tự nó đã là sản phẩm bán được.
2. **Cảnh báo và API** — Slack, email, webhook, REST API. Chi phí thấp, và là thứ giữ người dùng quay lại hằng ngày.
3. **Search Console + GA4** — nối hiển thị AI với traffic thật, trả lời câu hỏi ROI.
4. **Nội dung + CMS** — content analyzer và vòng lặp đo → sửa → đo lại.
5. **CRM** — gắn nguồn AI vào lead.

Kế hoạch triển khai chi tiết sẽ được lập riêng cho giai đoạn 1.
