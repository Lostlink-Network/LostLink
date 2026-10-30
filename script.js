 // ========================================
        // PRJ LOSTLINK - MAIN JAVASCRIPT
        // ========================================

        // ========L POSITION
        // ==========================================
        // PAGE SCROL==============================

        if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
        }

        window.addEventListener("pageshow", function () {
            window.scrollTo(0, 0);
        });

        // ========================================
        // GOOGLE SHEET
        // ========================================

        const sheetURL =
            "https://docs.google.com/spreadsheets/d/e/2PACX-1vT2f-TYo7GhC5rCURjJ29sp-jBOV4Ki_g5cL84HOUoqXm6XPc08i4Dp43pG91GpOiyLY2e00SArOzGE/pub?output=csv";
        const API_URL = "https://script.google.com/macros/s/AKfycbylXVFYTvxm52aW23HH1xCRknB6IsyQ82eDfUAxcztxTGhsmzlaXMfoNltv4hAvapj5dg/exec";

        // ========================================
        // LOCAL PROTOTYPE DATABASE
        // ========================================

        function getItems() {
            return JSON.parse(localStorage.getItem("lostlinkItems")) || [];
        }

        function saveItems(items) {
            localStorage.setItem("lostlinkItems", JSON.stringify(items));
        }


        // ========================================
        // LOAD GOOGLE SHEET
        // ========================================

        async function getGoogleSheetItems() {

            const response = await fetch(sheetURL);

            if (!response.ok) {
                throw new Error("Could not load Google Sheet.");
            }

            const csv = await response.text();

            const rows = parseCSV(csv);

            if (rows.length < 2) {
                return [];
            }

            const headers = rows[0].map(header =>
                header.trim()
            );

            return rows.slice(1).map(row => {

                let item = {};

                headers.forEach((header, index) => {
                    item[header] = row[index] || "";
                });

                return item;
            });
        }


        // ========================================
        // TEXT CLEANER
        // ========================================

        // Removes accidental spaces and line breaks
        // from descriptions and other text.

        function cleanText(value) {

            return String(value || "")
                .replace(/\s+/g, " ")
                .trim();
        }




        // ========================================
        // SEARCH
        // ========================================

        let lastSearchResults = null;
        let searchRequestId = 0;
        let searchRenderId = 0;

        // Render search results in the selected language.

        async function renderSearchResults(results) {
            const resultsBox = document.getElementById("results");
            if (!resultsBox) return;

            const currentRenderId = ++searchRenderId;
            const renderLanguage = language;
            const targetLang = renderLanguage === "JP" ? "ja" : "en";

            if (!Array.isArray(results) || results.length === 0) {
                resultsBox.textContent =
                    renderLanguage === "JP"
                        ? "該当する承認済みアイテムは見つかりませんでした。"
                        : "No approved items found.";
                return;
            }

            resultsBox.textContent =
                renderLanguage === "JP"
                    ? "検索結果を読み込み中..."
                    : "Loading results...";

            try {
                const renderedResults = await Promise.all(
                    results.map(async (item, index) => {
                        const name =
                            cleanText(item["Item name"] ?? item.name) ||
                            "Unknown item";

                        const description =
                            cleanText(item["Descption"] ?? item.description) ||
                            "No description";

                        const location =
                            cleanText(item["Location found"] ?? item.location) ||
                            "Unknown";

                        const rawDate =
                            item["Timestamp"] ??
                            item.timestamp ??
                            item["Date"] ??
                            item.date;

                        const date = rawDate ? String(rawDate) : "Unknown";

                        const photo =
                            cleanText(item["Photo"] ?? item.photo);

                        const [
                            displayName,
                            displayDescription,
                            displayLocation
                        ] = await Promise.all([
                            translateText(name, targetLang),
                            translateText(description, targetLang),
                            translateText(location, targetLang)
                        ]);

                        // Ignore outdated translations or renders.
                        if (
                            currentRenderId !== searchRenderId ||
                            renderLanguage !== language
                        ) {
                            return "";
                        }

                        const descriptionLabel =
                            renderLanguage === "JP" ? "説明" : "Description";

                        const locationLabel =
                            renderLanguage === "JP" ? "場所" : "Location";

                        const dateLabel =
                            renderLanguage === "JP" ? "日付" : "Date";

                        const photoLabel =
                            renderLanguage === "JP" ? "写真を見る" : "View Photo";

                        return `
                            <div class="search-result">
                                <strong>${escapeHTML(displayName)}</strong>

                                ${photo ? `
                                    <br>
                                    <a
                                        href="${escapeHTML(photo)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >${photoLabel}</a>
                                ` : ""}

                                <br>
                                ${descriptionLabel}:
                                ${escapeHTML(displayDescription)}

                                <br>
                                ${locationLabel}:
                                ${escapeHTML(displayLocation)}

                                <br>
                                ${dateLabel}:
                                ${escapeHTML(date)}

                                ${index < results.length - 1
                                    ? '<hr class="result-separator">'
                                    : ""}
                            </div>
                        `;
                    })
                );

                if (
                    currentRenderId !== searchRenderId ||
                    renderLanguage !== language
                ) {
                    return;
                }

                resultsBox.innerHTML = renderedResults.join("");

            } catch (error) {
                console.error("Rendering search results failed:", error);

                if (
                    currentRenderId === searchRenderId &&
                    renderLanguage === language
                ) {
                    resultsBox.textContent =
                        renderLanguage === "JP"
                            ? "検索結果の表示中にエラーが発生しました。"
                            : "An error occurred while displaying search results.";
                }
            }
        }


        // Refresh existing results when the display language changes.
        function refreshSearchResultsLanguage() {
            if (!Array.isArray(lastSearchResults)) return;

            renderSearchResults(lastSearchResults);
        }


        // Search using the Google Apps Script API.

        
function normalizeSearchCategory(value) {
    return String(value || "")
        .trim()
        .replace(/\s*\([^)]*\)\s*/g, "")
        .toLowerCase();
}

async function searchItem() {
    const searchBox = document.getElementById("searchBox");
    const categorySelect = document.getElementById("categoryFilter");
    const resultsBox = document.getElementById("results");

    if (!searchBox || !resultsBox) return;

    const keyword = searchBox.value.trim();
    const category = categorySelect
        ? categorySelect.value
        : "all";

    const currentRequestId = ++searchRequestId;

    if (!keyword && category === "all") {
        lastSearchResults = null;

        resultsBox.textContent =
            language === "JP"
                ? "キーワードを入力するか、カテゴリーを選択してください。"
                : "Enter a keyword or select a category.";

        return;
    }

    resultsBox.textContent =
        language === "JP" ? "検索中..." : "Searching...";

    try {
        const url = new URL(API_URL);

        if (keyword) {
            // Preserve bilingual keyword searching.
            const containsJapanese =
                /[\u3040-\u30ff\u3400-\u9fff]/.test(keyword);

            const targetSearchLang =
                containsJapanese ? "en" : "ja";

            const translatedKeyword = await translateText(
                keyword,
                targetSearchLang
            );

            if (currentRequestId !== searchRequestId) return;

            url.searchParams.set("action", "search");
            url.searchParams.set("q", keyword);
            url.searchParams.set("q2", translatedKeyword);
        } else {
            // Browse items in the selected category.
            url.searchParams.set("action", "latest");
            url.searchParams.set("limit", "1000");
        }

        if (category !== "all") {
            url.searchParams.set("category", category);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`API request failed: HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.items)) {
            throw new Error(data.error || "Invalid API response");
        }

        if (currentRequestId !== searchRequestId) return;

        let results = data.items;

        // Apply category matching even when the API already filters.
        if (category !== "all") {
            const selectedCategory =
                normalizeSearchCategory(category);

            results = results.filter(item => {
                const itemCategory =
                    item.category ??
                    item["Category"] ??
                    item["Item category"] ??
                    "";

                return normalizeSearchCategory(itemCategory) ===
                    selectedCategory;
            });
        }

        lastSearchResults = results;
        await renderSearchResults(results);

    } catch (error) {
        if (currentRequestId !== searchRequestId) return;

        console.error("Search failed:", error);

        resultsBox.textContent =
            language === "JP"
                ? "現在、アイテムを検索できません。"
                : "Unable to search the items right now.";
    }
}



        function refreshSearchResultsLanguage() {
            if (!Array.isArray(lastSearchResults)) return;

            renderSearchResults(lastSearchResults);
        }




        // ========================================
        // SUBMIT ITEM - LOCAL TEST
        // ========================================

        function submitItem() {

            const name =
                document.getElementById("itemName").value;

            const description =
                document.getElementById("description").value;

            const location =
                document.getElementById("location").value;

            const date =
                document.getElementById("date").value;

            if (name === "") {

                document.getElementById("message").innerText =
                    "Please enter an item name.";

                return;
            }

            const items =
                getItems();

            const newItem = {

                id: Date.now(),

                name: name,

                description: description,

                location: location,

                date: date,

                status: "Pending"
            };

            items.push(newItem);

            saveItems(items);

            document.getElementById("message").innerText =
                "Submission received! Waiting for admin approval.";

            document.getElementById("itemName").value = "";

            document.getElementById("description").value = "";

            document.getElementById("location").value = "";

            document.getElementById("date").value = "";
        }


        // ========================================
        // ADMIN LOGIN
        // ========================================

        function adminLogin() {

            const username =
                document.getElementById("username").value;

            const password =
                document.getElementById("password").value;

            if (
                username === "LostLink ADMN" &&
                password === "EB31A"
            ) {

                window.location.href =
                    "admin-dashboard.html";

            } else {

                document.getElementById("loginMessage").innerText =
                    "Incorrect username or password.";
            }
        }


        // ========================================
        // ADMIN DASHBOARD
        // ========================================

        function loadAdminItems() {

            const items =
                getItems();

            const container =
                document.getElementById("pendingItems");

            if (!container) {
                return;
            }

            const pending =
                items.filter(item =>
                    item.status === "Pending"
                );

            if (pending.length === 0) {

                container.innerHTML =
                    "<p>No pending submissions.</p>";

                return;
            }

            container.innerHTML =
                pending.map(item => {

                    return `
                        <div>

                            <hr>

                            <strong>
                                ${escapeHTML(item.name)}
                            </strong>

                            <br>

                            Description:
                            ${escapeHTML(
                                cleanText(item.description)
                            )}

                            <br>

                            Location:
                            ${escapeHTML(item.location)}

                            <br>

                            Date:
                            ${escapeHTML(item.date)}

                            <br><br>

                            <button onclick="approveItem(${item.id})">
                                Approve
                            </button>

                            <button onclick="rejectItem(${item.id})">
                                Reject
                            </button>

                        </div>
                    `;

                }).join("");
        }


        // ========================================
        // APPROVE ITEM
        // ========================================

        function approveItem(id) {

            let items =
                getItems();

            const item =
                items.find(item =>
                    item.id === id
                );

            if (item) {

                item.status =
                    "Approved";
            }

            saveItems(items);

            loadAdminItems();
        }


        // ========================================
        // REJECT ITEM
        // ========================================

        function rejectItem(id) {

            let items =
                getItems();

            items =
                items.filter(item =>
                    item.id !== id
                );

            saveItems(items);

            loadAdminItems();
        }

        // ========================================
        // SHARED TRANSLATION SYSTEM - EN / JP
        // ========================================

        const translationCache = new Map();
        const pendingTranslations = new Map();
        const translationRequestQueue = [];
        const MAX_TRANSLATION_REQUESTS = 3;
        let activeTranslationRequests = 0;

        async function fetchTranslationWithLimit(url) {
            if (activeTranslationRequests >= MAX_TRANSLATION_REQUESTS) {
                await new Promise(resolve => {
                    translationRequestQueue.push(resolve);
                });
            } else {
                activeTranslationRequests += 1;
            }

            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);

                try {
                    return await fetch(url, {
                        signal: controller.signal,
                        cache: "no-store"
                    });
                } finally {
                    clearTimeout(timeout);
                }
            } finally {
                const nextRequest = translationRequestQueue.shift();

                if (nextRequest) {
                    nextRequest();
                } else {
                    activeTranslationRequests -= 1;
                }
            }
        }

        function translationRetryDelay(response, attempt) {
            const retryAfter =
                response.headers && response.headers.get("Retry-After");

            if (retryAfter) {
                const seconds = Number(retryAfter);

                if (Number.isFinite(seconds)) {
                    return Math.min(seconds * 1000, 10000);
                }

                const retryAt = Date.parse(retryAfter);
                if (Number.isFinite(retryAt)) {
                    return Math.min(
                        Math.max(0, retryAt - Date.now()),
                        10000
                    );
                }
            }

            return 500 * (2 ** attempt);
        }

        async function requestTranslation(text, target) {
            const url =
                "https://translate.googleapis.com/translate_a/single" +
                `?client=gtx&sl=auto&tl=${target}&dt=t&q=` +
                encodeURIComponent(text);

            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    console.info("[Translation] Request:", {
                        target,
                        attempt: attempt + 1,
                        text
                    });

                    const response =
                        await fetchTranslationWithLimit(url);

                    console.info("[Translation] HTTP status:", response.status);

                    if (response.status === 429 || response.status >= 500) {
                        if (attempt === 2) {
                            throw new Error(`HTTP ${response.status}`);
                        }

                        await new Promise(resolve =>
                            setTimeout(
                                resolve,
                                translationRetryDelay(response, attempt)
                            )
                        );

                        continue;
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();

                    if (!Array.isArray(data[0])) {
                        throw new Error("Unexpected translation response format");
                    }

                    const translated = data[0]
                        .map(part => part[0] || "")
                        .join("");

                    if (!translated.trim()) {
                        throw new Error("Empty translation response");
                    }

                    console.info("[Translation] Success:", {
                        target,
                        original: text,
                        translated
                    });

                    return translated;

                } catch (error) {
                    console.error("[Translation] Attempt failed:", {
                        target,
                        attempt: attempt + 1,
                        text,
                        error: error.message || String(error)
                    });

                    if (attempt === 2) {
                        throw error;
                    }

                    await new Promise(resolve =>
                        setTimeout(resolve, 500 * (2 ** attempt))
                    );
                }
            }

            throw new Error("Translation failed after three attempts");
        }

        async function translateText(text, targetLang) {
            if (!text) return text;

            const target = targetLang.toLowerCase();
            const cacheKey = `${target}:${text}`;

            if (translationCache.has(cacheKey)) {
                return translationCache.get(cacheKey);
            }

            if (pendingTranslations.has(cacheKey)) {
                return pendingTranslations.get(cacheKey);
            }

            const translationPromise = requestTranslation(text, target)
                .then(translated => {
                    translationCache.set(cacheKey, translated);
                    return translated;
                })
                .catch(error => {
                    console.error("[Translation] Final failure:", {
                        target,
                        text,
                        error: error.message || String(error)
                    });
                    return text;
                })
                .finally(() => {
                    pendingTranslations.delete(cacheKey);
                });

            pendingTranslations.set(cacheKey, translationPromise);
            return translationPromise;
        }




        // ========================================
        // RECENTLY FOUND ITEMS - HOMEPAGE
        // ========================================

        async function loadLatestItems() {
            const container = document.getElementById("latestItems");
            if (!container) return;

            const renderLanguage = language;

            container.textContent =
                renderLanguage === "JP" ? "読み込み中..." : "Loading...";

            try {
                const response = await fetch(
                    `${API_URL}?action=latest&limit=4`
                );

                if (!response.ok) {
                    throw new Error("LostLink API request failed.");
                }

                const data = await response.json();

                if (!data.success || !Array.isArray(data.items)) {
                    throw new Error(data.error || "Invalid API response.");
                }

                if (renderLanguage !== language) return;

                const recent = data.items;

                if (recent.length === 0) {
                    container.textContent =
                        renderLanguage === "JP"
                            ? "承認されたアイテムはありません。"
                            : "No approved items yet.";
                    return;
                }

                const targetLang =
                    renderLanguage === "JP" ? "ja" : "en";

                const cards = await Promise.all(
                    recent.map(async item => {
                        const name =
                            cleanText(item.name ?? item["Item name"]) ||
                            "Unknown item";

                        const description =
                            cleanText(item.description ?? item["Descption"]) ||
                            "No description";

                        const location =
                            cleanText(item.location ?? item["Location found"]) ||
                            "Unknown";

                        const date =
                            cleanText(item.timestamp ?? item["Timestamp"]) ||
                            "Unknown";

                        const photo = cleanText(item.photo ?? item["Photo"]);

                        const [displayName, displayDescription, displayLocation] =
                            await Promise.all([
                                translateText(name, targetLang),
                                translateText(description, targetLang),
                                translateText(location, targetLang)
                            ]);

                        const descriptionLabel =
                            renderLanguage === "JP" ? "説明:" : "Description:";

                        const locationLabel =
                            renderLanguage === "JP" ? "場所:" : "Location:";

                        const dateLabel =
                            renderLanguage === "JP" ? "日付:" : "Date:";

                        const photoLabel =
                            renderLanguage === "JP" ? "写真を見る" : "View Photo";

                        return `
                            <div>
                                <strong>${escapeHTML(displayName)}</strong>

                                ${photo ? `
                                    <br>
                                    <a
                                        href="${escapeHTML(photo)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >${photoLabel}</a>
                                ` : ""}

                                <br>
                                ${descriptionLabel}
                                ${escapeHTML(displayDescription)}

                                <br>
                                ${locationLabel}
                                ${escapeHTML(displayLocation)}

                                <br>
                                ${dateLabel}
                                ${escapeHTML(date)}
                            </div>
                            <hr>
                        `;
                    })
                );

                if (renderLanguage !== language) return;

                container.innerHTML = cards.join("");

            } catch (error) {
                console.error("Homepage latest items error:", error);

                if (renderLanguage !== language) return;

                container.textContent =
                    renderLanguage === "JP"
                        ? "最近見つかったアイテムを読み込めませんでした。"
                        : "Unable to load recently found items.";
            }
        }




        // ========================================
        // ALL LATEST ITEMS PAGE
        // ========================================

        function filterLatestItems() {
            loadAllLatestItems(1);
        }

        async function loadAllLatestItems(page = 1) {
            const container = document.getElementById("allLatestItems");
            if (!container) return;

            const ITEMS_PER_PAGE = 20;
            const renderLanguage = language;
            const categoryFilter =
                document.getElementById("latestCategoryFilter")?.value || "";

            page = Number(page);
            if (!Number.isFinite(page) || page < 1) page = 1;

            container.textContent =
                renderLanguage === "JP" ? "読み込み中..." : "Loading...";

            try {
                // Request one page of approved items from the API.
                const offset = (page - 1) * ITEMS_PER_PAGE;
                const url = new URL(API_URL);

                url.searchParams.set("action", "latest");
                url.searchParams.set("limit", String(ITEMS_PER_PAGE));
                url.searchParams.set("offset", String(offset));

                // Filter by category on the server.
                if (categoryFilter) {
                    url.searchParams.set("category", categoryFilter);
                }

                const response = await fetch(url.toString());

                if (!response.ok) {
                    throw new Error(
                        `API request failed: HTTP ${response.status}`
                    );
                }

                const data = await response.json();

                if (!data.success || !Array.isArray(data.items)) {
                    throw new Error(
                        data.error || "Invalid API response."
                    );
                }

                if (renderLanguage !== language) return;

                const pageItems = data.items;
                const totalItems = Number.isFinite(Number(data.total))
                    ? Number(data.total)
                    : pageItems.length;

                const totalPages = Math.max(
                    1,
                    Math.ceil(totalItems / ITEMS_PER_PAGE)
                );

                page = Math.max(1, Math.min(page, totalPages));

                if (pageItems.length === 0) {
                    container.textContent =
                        renderLanguage === "JP"
                            ? categoryFilter
                                ? "このカテゴリーのアイテムはありません。"
                                : "承認されたアイテムはありません。"
                            : categoryFilter
                                ? "No items found in this category."
                                : "No approved items yet.";
                    return;
                }

                const targetLang =
                    renderLanguage === "JP" ? "ja" : "en";

                const cards = await Promise.all(
                    pageItems.map(async item => {
                        const name =
                            cleanText(item.name) || "Unknown item";

                        const description =
                            cleanText(item.description) || "No description";

                        const location =
                            cleanText(item.location) || "Unknown";

                        const date =
                            cleanText(item.timestamp || item.date) || "Unknown";

                        const photo = cleanText(item.photo);
                        const category = cleanText(item.category);

                        const [
                            displayName,
                            displayDescription,
                            displayLocation,
                            displayCategory
                        ] = await Promise.all([
                            translateText(name, targetLang),
                            translateText(description, targetLang),
                            translateText(location, targetLang),
                            category
                                ? translateText(category, targetLang)
                                : Promise.resolve("")
                        ]);

                        const descriptionLabel =
                            renderLanguage === "JP"
                                ? "説明:"
                                : "Description:";

                        const locationLabel =
                            renderLanguage === "JP"
                                ? "場所:"
                                : "Location:";

                        const dateLabel =
                            renderLanguage === "JP"
                                ? "日付:"
                                : "Date:";

                        const categoryLabel =
                            renderLanguage === "JP"
                                ? "カテゴリー:"
                                : "Category:";

                        const photoLabel =
                            renderLanguage === "JP"
                                ? "写真を見る"
                                : "View Photo";

                        return `
                            <div class="latest-item">
                                <strong>${escapeHTML(displayName)}</strong><br>

                                ${displayCategory ? `
                                    ${categoryLabel}
                                    ${escapeHTML(displayCategory)}<br>
                                ` : ""}

                                ${photo ? `
                                    <a
                                        href="${escapeHTML(photo)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >${photoLabel}</a><br>
                                ` : ""}

                                ${descriptionLabel}
                                ${escapeHTML(displayDescription)}<br>

                                ${locationLabel}
                                ${escapeHTML(displayLocation)}<br>

                                ${dateLabel}
                                ${escapeHTML(date)}
                            </div>
                            <hr>
                        `;
                    })
                );

                if (renderLanguage !== language) return;

                const previousLabel =
                    renderLanguage === "JP" ? "前へ" : "Previous";

                const nextLabel =
                    renderLanguage === "JP" ? "次へ" : "Next";

                const pageLabel = renderLanguage === "JP"
                    ? `${page} / ${totalPages} ページ`
                    : `Page ${page} of ${totalPages}`;

                const pagination = `
                    <div style="
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 12px;
                        width: 100%;
                        margin: 25px auto;
                        text-align: center;
                    ">
                        ${page > 1 ? `
                            <button
                                type="button"
                                onclick="loadAllLatestItems(${page - 1})"
                            >
                                ${previousLabel}
                            </button>
                        ` : ""}

                        <span style="white-space: nowrap;">
                            ${pageLabel}
                        </span>

                        ${page < totalPages ? `
                            <button
                                type="button"
                                onclick="loadAllLatestItems(${page + 1})"
                            >
                                ${nextLabel}
                            </button>
                        ` : ""}
                    </div>
                `;

                container.innerHTML = cards.join("") + pagination;

            } catch (error) {
                console.error("Latest items error:", error);

                if (renderLanguage !== language) return;

                container.textContent =
                    renderLanguage === "JP"
                        ? "最新アイテムを読み込めませんでした。"
                        : "Unable to load latest items.";
            }
        }


        // ========================================
        // SIMPLE CSV PARSER
        // ========================================

        function parseCSV(text) {

            const rows = [];

            let row = [];

            let value = "";

            let insideQuotes = false;

            for (
                let i = 0;
                i < text.length;
                i++
            ) {

                const character =
                    text[i];

                const nextCharacter =
                    text[i + 1];

                if (
                    character === '"' &&
                    insideQuotes &&
                    nextCharacter === '"'
                ) {

                    value += '"';

                    i++;
                }

                else if (
                    character === '"'
                ) {

                    insideQuotes =
                        !insideQuotes;
                }

                else if (
                    character === "," &&
                    !insideQuotes
                ) {

                    row.push(value);

                    value = "";
                }

                else if (
                    (
                        character === "\n" ||
                        character === "\r"
                    ) &&
                    !insideQuotes
                ) {

                    if (
                        character === "\r" &&
                        nextCharacter === "\n"
                    ) {

                        i++;
                    }

                    row.push(value);

                    rows.push(row);

                    row = [];

                    value = "";
                }

                else {

                    value += character;
                }
            }

            if (
                value !== "" ||
                row.length > 0
            ) {

                row.push(value);

                rows.push(row);
            }

            return rows;
        }


        // ========================================
        // SECURITY / HTML ESCAPING
        // ========================================

        function escapeHTML(value) {

            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }


        // ========================================
        // LANGUAGE - EN / JP
        // ========================================

        let language =
            localStorage.getItem("lostlinkLanguage") || "EN";

        function setLanguage(selectedLanguage) {
            if (selectedLanguage !== "EN" && selectedLanguage !== "JP") {
                return;
            }

            language = selectedLanguage;

            try {
                localStorage.setItem("lostlinkLanguage", language);
            } catch (error) {
                console.warn("Could not save language preference:", error);
            }

        updateLanguageButtons();

        if (typeof applyTranslations === "function") {
            applyTranslations();
        }

        if (typeof loadLatestItems === "function") {
            loadLatestItems();
        }

        if (typeof loadAllLatestItems === "function") {
            loadAllLatestItems();
        }

        if (typeof refreshSearchResultsLanguage === "function") {
            refreshSearchResultsLanguage();
        }

        }

        function updateLanguageButtons() {

            const enButton = document.getElementById("enButton");
            const jpButton = document.getElementById("jpButton");

            if (!enButton || !jpButton) {
                return;
            }

            enButton.classList.toggle("selected", language === "EN");
            jpButton.classList.toggle("selected", language === "JP");
        }

        updateLanguageButtons();


        // ========================================
        // TRANSLATIONS
        // ========================================

        const translations = {

            EN: {

                subTitle:
                    "Student Lost & Found System",

                menuTitle:
                    "Menu",

                menuSearch:
                    "Search for an item",

                menuReport:
                    "Report a lost/found item",

                menuLatest:
                    "View Latest Items",

                recentTitle:
                    "Recently Found Items",

                loadingText:
                    "Loading...",

                viewAllLink:
                    "View all latest items",

                systemDescLink:
                    "System Description",

                systemHistoryLink:
                    "System History",

                pageTitle:
                    "LostLink NTW",

                pageSubtitle:
                    "System Description",

                devTagline:
                    "Lost, Found, Reconnected.",

                devPrivacyTitle:
                    "Here LostLink, We value your Privacy and Security",

                devPrivacyDescription:
                    "We Protect Your Privacy and Ensure the Security of Your Data",

                devDataDescription:
                    "We ensure we take no personal data from you and your device",

                devDescriptionTitle:
                    "Description of the system",

                devDescriptionText:
                    "We are a student lost and found system designed to help students locate their lost items and reconnect with them.",

                devThanksText:
                    "This system was created with help of NEXUS. Thankyou very much for your support.",

                creatorLabel:
                    "Creator and Maintainer (Nickname):",

                devCreatorName:
                    "Enagetic Cat",

                ownerLabel:
                    "System Owned by:",

                devOwnerName:
                    "Programing Circle",

                poweredLabel:
                    "This System is Powered by",

                githubTitle:
                    "Git-Hub",

                devNexusDescription:
                    "Networked EXchange & Unified Search",

                warningText:
                    "WARNING: This system tend to have technical errors with Google Chrome (MOBILE).",

                browserText:
                    "DEFAULT BROWSER IS RECOMMENDED",

                latestTitle:
                    "Latest Items",

                reportTitle:
                    "Report an Item",

                reportInstruction:
                    "Click the link below to open the report form:",

                guidelineInstruction:
                    "Please read the submission guidelines before submitting:",

                guidelineLink:
                    "Submission Guidelines (PDF)",

                reportFormLink:
                    "Open Lost & Found Report Form",

                feedbackTitle:
                    "Feedback",

                feedbackDescription:
                    "We welcome your feedback to help improve this Project. We value your input and suggestions, and we encourage you to share your thoughts with us. Thank you for taking the time to provide feedback and help us make this Project even better!",

                feedbackFormLink:
                    "Open Feedback Form",

                backHomeLink:
                    "Back to Home",

                searchTitle:
                    "Search",

                categoryLabel:
                    "Category (Optional):",

                searchButton:
                    "Search",

                searchPlaceholder:
                    "Enter item name, description, or location",

                searchResultsDefault:
                    "Enter a search term above."
            },

            JP: {

                subTitle:
                    "生徒 忘れ物・落とし物システム",

                menuTitle:
                    "メニュー",

                menuSearch:
                    "落とし物を検索する",

                menuReport:
                    "落とし物を報告する",

                menuLatest:
                    "報告された落とし物を閲覧する",

                recentTitle:
                    "最近報告された落とし物",

                loadingText:
                    "読み込み中...",

                viewAllLink:
                    "すべての報告された落し物を見る",

                systemDescLink:
                    "システム詳細",

                systemHistoryLink:
                    "システム履歴",

                pageTitle:
                    "LostLink NTW",

                pageSubtitle:
                    "システム詳細",

                devTagline:
                    "Lost, Found, Reconnected.",

                devPrivacyTitle:
                    "LostLinkは皆様のプライバシーと安全を大切にしています",

                devPrivacyDescription:
                    "皆様のプライバシーを守り、データの安全を確保します。",

                devDataDescription:
                    "皆様やお使いの端末から個人情報を取得することはありません。",

                devDescriptionTitle:
                    "システムの説明",

                devDescriptionText:
                    "LostLinkは、学生が落とし物を探し、持ち主のもとへ返すための学生向け落とし物サービスです。",

                devThanksText:
                    "このシステムはNEXUSの協力により制作されました。ご支援に心より感謝いたします。",

                creatorLabel:
                    "制作者・管理者（ニックネーム）：",

                devCreatorName:
                    "Enagetic Cat",

                ownerLabel:
                    "システム所有者：",

                devOwnerName:
                    "プログラミングサークル",

                poweredLabel:
                    "このシステムは次世代の技術で駆動しています",

                githubTitle:
                    "GitHub",

                devNexusDescription:
                    "ネットワーク型の交換・統合検索システム",

                warningText:
                    "警告：このシステムはGoogle Chrome（モバイル）で技術的なエラーが発生します。",

                browserText:
                    "デフォルトブラウザの使用をお勧めします",

                latestTitle:
                    "最近発見された落とし物",

                reportTitle:
                    "落とし物を報告する",

                reportInstruction:
                    "落とし物を報告するには、以下のリンクをクリックしてください：",

                guidelineInstruction:
                    "投稿前に、以下の投稿ガイドラインをお読みください：",

                guidelineLink:
                    "投稿ガイドライン（PDF）",

                reportFormLink:
                    "忘れ物・落とし物レポートフォームを開く",

                feedbackTitle:
                    "ご意見・ご感想",

                feedbackDescription:
                    "本プロジェクトの改善に役立てるため、皆様からのご意見をお待ちしております。皆様からのご意見やご提案を大切にしておりますので、ぜひご感想をお寄せください。お時間を割いてご意見をお寄せいただき、本プロジェクトをさらに良いものにするお手伝いをいただき、誠にありがとうございます！",

                feedbackFormLink:
                    "フィードバックフォームを開く",

                backHomeLink:
                    "ホームに戻る",

                searchTitle:
                    "検索",

                categoryLabel:
                    "カテゴリー (任意):",

                searchButton:
                    "検索する",

                searchPlaceholder:
                    "アイテム名、説明、または場所を入力してください",

                searchResultsDefault:
                    "上に検索語を入力してください。"
            }
        };


        // ========================================
        // APPLY TRANSLATIONS
        // ========================================

        function applyTranslations() {

            const t =
                translations[language];

            if (!t) {
                return;
            }

            for (const key in t) {

                const el =
                    document.getElementById(key);

                if (el) {

                    if (
                        el.tagName === "INPUT" &&
                        key === "searchPlaceholder"
                    ) {

                        el.placeholder =
                            t[key];

                    } else {

                        el.innerText =
                            t[key];
                    }
                }
            }
            updateLatestCategoryFilterLanguage();
        }

        function updateLatestCategoryFilterLanguage() {
            const label = document.getElementById("categoryFilterLabel");
            const select = document.getElementById("latestCategoryFilter");
            if (!label || !select) return;

            const categoryLabels = {
                "": ["All Categories", "すべてのカテゴリー"],
                "Stationery": ["Stationery", "文房具"],
                "Electronics": ["Electronics", "電子機器"],
                "School Supplies": ["School Supplies", "学用品"],
                "Bags & Pouches": ["Bags & Pouches", "バッグ・ポーチ"],
                "Clothing & Uniforms": ["Clothing & Uniforms", "衣類・制服"],
                "Everyday Items": ["Everyday Items", "日用品"],
                "Wallets & Cards": ["Wallets & Cards", "財布・カード"],
                "Keys": ["Keys", "鍵"],
                "Accessories": ["Accessories", "アクセサリー"],
                "Sports Equipment": ["Sports Equipment", "スポーツ用品"],
                "Other": ["Other", "その他"]
            };
            const labelIndex = language === "JP" ? 1 : 0;

            label.textContent = language === "JP" ? "カテゴリー:" : "Category:";
            Array.from(select.options).forEach(option => {
                const labels = categoryLabels[option.value];
                if (labels) option.textContent = labels[labelIndex];
            });
        }


        // ========================================
        // PAGE START
        // ========================================

        document.addEventListener(
            "DOMContentLoaded",
            function () {

                updateLanguageButtons();

                applyTranslations();
            }
        );


        // ========================================
        // START FUNCTIONS
        // ========================================

        // Admin dashboard

        if (
            document.getElementById(
                "pendingItems"
            )
        ) {

            loadAdminItems();
        }


        // Homepage

        if (
            document.getElementById(
                "latestItems"
            )
        ) {

            loadLatestItems();
        }


        // Full latest items page

        if (
            document.getElementById(
                "allLatestItems"
            )
        ) {

            loadAllLatestItems();
        }