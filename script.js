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
            results.map(async item => {
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

                const date = rawDate
                    ? String(rawDate)
                    : "Unknown";

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

                // Ignore results from an outdated render.
                if (
                    currentRenderId !== searchRenderId ||
                    renderLanguage !== language
                ) {
                    return "";
                }

                const descriptionLabel =
                    renderLanguage === "JP"
                        ? "説明"
                        : "Description";

                const locationLabel =
                    renderLanguage === "JP"
                        ? "場所"
                        : "Location";

                const dateLabel =
                    renderLanguage === "JP"
                        ? "日付"
                        : "Date";

                const photoLabel =
                    renderLanguage === "JP"
                        ? "写真を見る"
                        : "View Photo";

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
                    </div>
                    <hr>
                `;
            })
        );

        // Check again before updating the page.
        if (
            currentRenderId !== searchRenderId ||
            renderLanguage !== language
        ) {
            return;
        }

        resultsBox.innerHTML = renderedResults.join("");

    } catch (error) {
        console.error(
            "Rendering search results failed:",
            error
        );

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

async function searchItem() {
    const searchBox = document.getElementById("searchBox");
    const resultsBox = document.getElementById("results");

    if (!searchBox || !resultsBox) return;

    const keyword = searchBox.value.trim();
    const currentRequestId = ++searchRequestId;

    if (!keyword) {
        resultsBox.innerText =
            language === "JP"
                ? "検索キーワードを入力してください。"
                : "Please enter a search keyword.";
        lastSearchResults = null;
        return;
    }

    resultsBox.innerText =
        language === "JP" ? "検索中..." : "Searching...";

    try {
        // Detect Japanese independently of the display language.
        const containsJapanese =
            /[\u3040-\u30ff\u3400-\u9fff]/.test(keyword);

        const targetSearchLang = containsJapanese ? "en" : "ja";
        const translatedKeyword = await translateText(
            keyword,
            targetSearchLang
        );

        if (currentRequestId !== searchRequestId) return;

        const url = new URL(API_URL);
        url.searchParams.set("action", "search");
        url.searchParams.set("q", keyword);
        url.searchParams.set("q2", translatedKeyword);

        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`API request failed: HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.items)) {
            throw new Error(data.error || "Invalid API response");
        }

        if (currentRequestId !== searchRequestId) return;

        lastSearchResults = data.items;
        await renderSearchResults(data.items);

    } catch (error) {
        console.error("Search failed:", error);

        if (currentRequestId !== searchRequestId) return;

        resultsBox.innerText =
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

const translationCache = {};

async function translateText(text, targetLang) {
    if (!text) return text;

    const target = targetLang.toLowerCase();
    const cacheKey = `${target}:${text}`;

    if (translationCache[cacheKey]) {
        return translationCache[cacheKey];
    }

    try {
        const url =
            "https://translate.googleapis.com/translate_a/single" +
            `?client=gtx&sl=auto&tl=${target}&dt=t&q=` +
            encodeURIComponent(text);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Translation request failed");
        }

        const data = await response.json();

        const translated = Array.isArray(data[0])
            ? data[0].map(part => part[0] || "").join("")
            : "";

        if (translated) {
            translationCache[cacheKey] = translated;
            return translated;
        }

        return text;
    } catch (error) {
        console.warn("Translation failed:", error);
        return text;
    }
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
            `${API_URL}?action=latest&limit=3`
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

async function loadAllLatestItems(page = 1) {
    const container = document.getElementById("allLatestItems");
    if (!container) return;

    const ITEMS_PER_PAGE = 20;
    const renderLanguage = language;

    container.textContent =
        renderLanguage === "JP" ? "読み込み中..." : "Loading...";

    try {
        const items = await getGoogleSheetItems();

        if (renderLanguage !== language) return;

        const approved = items.filter(item =>
            String(item["Status"] || "").trim().toLowerCase() === "approved"
        );

        approved.sort((a, b) =>
            new Date(b["Timestamp"] || 0) -
            new Date(a["Timestamp"] || 0)
        );

        if (approved.length === 0) {
            container.textContent =
                renderLanguage === "JP"
                    ? "承認されたアイテムはありません。"
                    : "No approved items yet.";
            return;
        }

        const totalPages = Math.ceil(
            approved.length / ITEMS_PER_PAGE
        );

        page = Number(page);
        if (!Number.isFinite(page)) page = 1;

        page = Math.max(1, Math.min(page, totalPages));

        const start = (page - 1) * ITEMS_PER_PAGE;
        const pageItems = approved.slice(
            start,
            start + ITEMS_PER_PAGE
        );

        const targetLang =
            renderLanguage === "JP" ? "ja" : "en";

        const cards = await Promise.all(
            pageItems.map(async item => {
                const name =
                    cleanText(item["Item name"]) || "Unknown item";

                const description =
                    cleanText(item["Descption"]) || "No description";

                const location =
                    cleanText(item["Location found"]) || "Unknown";

                const rawDate =
                    item["Timestamp"] || item["Date"];

                const date = rawDate
                    ? String(rawDate)
                    : "Unknown";

                const photo = cleanText(item["Photo"]);

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
                        <strong>${escapeHTML(displayName)}</strong><br>

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
                    <button type="button"
                        onclick="loadAllLatestItems(${page - 1})">
                        ${previousLabel}
                    </button>
                ` : ""}

                <span style="white-space: nowrap;">
                    ${pageLabel}
                </span>

                ${page < totalPages ? `
                    <button type="button"
                        onclick="loadAllLatestItems(${page + 1})">
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
            "[1] Search for an item",

        menuReport:
            "[2] Report a lost/found item",

        menuLatest:
            "[3] View Latest Items",

        recentTitle:
            "Recently Found Items",

        loadingText:
            "Loading...",

        viewAllLink:
            "View all latest items",

        systemDescLink:
            "System Description",

        pageTitle:
            "LostLink NTW",

        pageSubtitle:
            "System Description",

        creatorLabel:
            "Creator and Maintainer (Nickname):",

        ownerLabel:
            "System Owned by:",

        poweredLabel:
            "This System is Powered by",

        githubTitle:
            "Git-Hub",

        warningText:
            "WARNING: This system tend to have technical errors with Google Chrome (MOBILE).",

        browserText:
            "DEFAULT BROWSER IS RECOMMENDED",

        backHome:
            "Back to Home",

        latestTitle:
            "Latest Items",

        reportTitle:
            "Report an Item",

        reportInstruction:
            "Click the link below to open the report form:",

        reportFormLink:
            "Open Lost & Found Report Form",

        searchTitle:
            "Search",

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
            "メニューへ戻る",

        menuSearch:
            "[1] 落とし物を検索する",

        menuReport:
            "[2] 落とし物を報告する",

        menuLatest:
            "[3] 報告された落とし物を閲覧する",

        recentTitle:
            "最近報告された落とし物",

        loadingText:
            "読み込み中...",

        viewAllLink:
            "すべての報告された落し物を見る",

        systemDescLink:
            "システム詳細",

        pageTitle:
            "LostLink NTW",

        pageSubtitle:
            "システム詳細",

        creatorLabel:
            "本サイトの持管理者のニックネーム：",

        ownerLabel:
            "システム所有者：",

        poweredLabel:
            "このシステムは次世代の技術で駆動しています",

        githubTitle:
            "GitHub",

        warningText:
            "警告：このシステムはGoogle Chrome（モバイル）で技術的なエラーが発生します。",

        browserText:
            "デフォルトブラウザの使用をお勧めします",

        backHome:
            "ホームに戻る",

        latestTitle:
            "最近発見された落とし物",

        reportTitle:
            "落とし物を報告する",

        reportInstruction:
            "落とし物を報告するには、以下のリンクをクリックしてください：",

        reportFormLink:
            "忘れ物・落とし物レポートフォームを開く",

        searchTitle:
            "検索",

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
