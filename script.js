// ========================================
// PRJ LOSTLINK - MAIN JAVASCRIPT
// ========================================

// ========================================
// PAGE SCROLL POSITION
// ========================================

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

    const cachedData =
        sessionStorage.getItem("lostlinkSheetCache");

    if (cachedData) {
        return JSON.parse(cachedData);
    }

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

    const items = rows.slice(1).map(row => {

        let item = {};

        headers.forEach((header, index) => {
            item[header] = row[index] || "";
        });

        return item;
    });

    sessionStorage.setItem(
        "lostlinkSheetCache",
        JSON.stringify(items)
    );

    return items;
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

async function searchItem() {

    const searchBox =
        document.getElementById("searchBox");

    const resultsBox =
        document.getElementById("results");

    if (!searchBox || !resultsBox) {
        return;
    }

    const keyword =
        searchBox.value.trim().toLowerCase();

    if (keyword === "") {

        resultsBox.innerText =
            "Please enter a search term above.";

        return;
    }

    resultsBox.innerText =
        "Searching...";

    try {

        const items =
            await getGoogleSheetItems();

        const approved =
            items.filter(item =>
                String(item["Status"])
                    .trim()
                    .toLowerCase() === "approved"
            );

        const results =
            approved.filter(item => {

                const name =
                    cleanText(item["Item name"])
                        .toLowerCase();

                const description =
                    cleanText(item["Descption"])
                        .toLowerCase();

                const location =
                    cleanText(item["Location found"])
                        .toLowerCase();

                return (
                    name.includes(keyword) ||
                    description.includes(keyword) ||
                    location.includes(keyword)
                );
            });

        if (results.length === 0) {

            resultsBox.innerText =
                "No approved items found.";

            return;
        }

        resultsBox.innerHTML =
            results.map(item => {

                const name =
                    cleanText(item["Item name"]) ||
                    "Unknown item";

                const description =
                    cleanText(item["Descption"]);

                const location =
                    cleanText(item["Location found"]) ||
                    "Unknown";

                const date =
                    cleanText(item["Date"]) ||
                    "Unknown";

                const photo =
                    cleanText(item["Photo"]);

                return `
                    <div>

                        <strong>
                            ${escapeHTML(name)}
                        </strong>

                        ${
                            photo
                                ? `
                                    <br>

                                    <a
                                        href="${escapeHTML(photo)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View Photo
                                    </a>
                                `
                                : ""
                        }

                        <br><br>

                        Description:
                        ${escapeHTML(description)}

                        <br>

                        Location:
                        ${escapeHTML(location)}

                        <br>

                        Date:
                        ${escapeHTML(date)}

                    </div>

                    <hr>
                `;

            }).join("");

    } catch (error) {

        console.error(
            "Search error:",
            error
        );

        resultsBox.innerText =
            "Unable to search the items right now.";
    }
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
// TRANSLATION CACHE
// ========================================

const translationCache = {};

async function translateText(text, targetLang) {

    if (!text || targetLang === "EN") {
        return text;
    }

    const cacheKey =
        `${targetLang}_${text}`;

    if (translationCache[cacheKey]) {
        return translationCache[cacheKey];
    }

    try {

        const url =
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=` +
            encodeURIComponent(text);

        const res =
            await fetch(url);

        const data =
            await res.json();

        const translated =
            data[0]
                .map(item => item[0])
                .join("");

        translationCache[cacheKey] =
            translated;

        return translated;

    } catch (e) {

        return text;
    }
}


// ========================================
// RECENTLY FOUND ITEMS - HOMEPAGE
// ========================================

async function loadLatestItems() {

    const container =
        document.getElementById("latestItems");

    if (!container) {
        return;
    }

    container.innerHTML =
        language === "JP"
            ? "読み込み中..."
            : "Loading...";

    try {

        const items =
            await getGoogleSheetItems();

        const approved =
            items.filter(item =>
                String(item["Status"])
                    .trim()
                    .toLowerCase() === "approved"
            );

        approved.sort(
            (a, b) =>
                new Date(b["Timestamp"]) -
                new Date(a["Timestamp"])
        );

        const recent =
            approved.slice(0, 3);

        if (recent.length === 0) {

            container.innerHTML =
                language === "JP"
                    ? "<p>承認されたアイテムはありません。</p>"
                    : "<p>No approved items yet.</p>";

            return;
        }

        const targetLang =
            language === "JP"
                ? "ja"
                : "EN";

        let htmlCards = "";

        for (const item of recent) {

            let itemName =
                cleanText(item["Item name"]) ||
                "Unknown item";

            let description =
                cleanText(item["Descption"]) ||
                "No description";

            let location =
                cleanText(item["Location found"]) ||
                "Unknown";

            let date =
                cleanText(item["Date"]) ||
                "Unknown";

            if (targetLang === "ja") {

                itemName =
                    await translateText(
                        itemName,
                        "ja"
                    );

                description =
                    await translateText(
                        description,
                        "ja"
                    );

                location =
                    await translateText(
                        location,
                        "ja"
                    );
            }

            const descLabel =
                language === "JP"
                    ? "説明:"
                    : "Description:";

            const locLabel =
                language === "JP"
                    ? "場所:"
                    : "Location:";

            const dateLabel =
                language === "JP"
                    ? "日付:"
                    : "Date:";

            htmlCards += `
                <div>

                    <strong>
                        ${escapeHTML(itemName)}
                    </strong>

                    <br><br>

                    ${descLabel}
                    ${escapeHTML(description)}

                    <br>

                    ${locLabel}
                    ${escapeHTML(location)}

                    <br>

                    ${dateLabel}
                    ${escapeHTML(date)}

                </div>

                <hr>
            `;
        }

        container.innerHTML =
            htmlCards;

    } catch (error) {

        console.error(
            "Google Sheet error:",
            error
        );

        container.innerHTML =
            language === "JP"
                ? "<p>最近見つかったアイテムを読み込めませんでした。</p>"
                : "<p>Unable to load recently found items.</p>";
    }
}


// ========================================
// ALL LATEST ITEMS PAGE
// ========================================

async function loadAllLatestItems() {

    const container =
        document.getElementById("allLatestItems");

    if (!container) {
        return;
    }

    container.innerHTML =
        language === "JP"
            ? "読み込み中..."
            : "Loading...";

    try {

        const items =
            await getGoogleSheetItems();

        const approved =
            items.filter(item =>
                String(item["Status"])
                    .trim()
                    .toLowerCase() === "approved"
            );

        approved.sort(
            (a, b) =>
                new Date(b["Timestamp"]) -
                new Date(a["Timestamp"])
        );

        if (approved.length === 0) {

            container.innerHTML =
                language === "JP"
                    ? "<p>承認されたアイテムはありません。</p>"
                    : "<p>No approved items yet.</p>";

            return;
        }

        const targetLang =
            language === "JP"
                ? "ja"
                : "EN";

        let htmlCards = "";

        for (const item of approved) {

            let itemName =
                cleanText(item["Item name"]) ||
                "Unknown item";

            let description =
                cleanText(item["Descption"]) ||
                "No description";

            let location =
                cleanText(item["Location found"]) ||
                "Unknown";

            let date =
                cleanText(item["Date"]) ||
                "Unknown";

            const photo =
                cleanText(item["Photo"]);

            if (targetLang === "ja") {

                itemName =
                    await translateText(
                        itemName,
                        "ja"
                    );

                description =
                    await translateText(
                        description,
                        "ja"
                    );

                location =
                    await translateText(
                        location,
                        "ja"
                    );
            }

            const descLabel =
                language === "JP"
                    ? "説明:"
                    : "Description:";

            const locLabel =
                language === "JP"
                    ? "場所:"
                    : "Location:";

            const dateLabel =
                language === "JP"
                    ? "日付:"
                    : "Date:";

            htmlCards += `
                <div>

                    <strong>
                        ${escapeHTML(itemName)}
                    </strong>

                    <br>

                    ${
                        photo
                            ? `
                                <a
                                    href="${escapeHTML(photo)}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    ${language === "JP"
                                        ? "写真を見る"
                                        : "View Photo"}
                                </a>
                                <br>
                            `
                            : ""
                    }

                    ${descLabel}
                    ${escapeHTML(description)}

                    <br>

                    ${locLabel}
                    ${escapeHTML(location)}

                    <br>

                    ${dateLabel}
                    ${escapeHTML(date)}

                </div>

                <hr>
            `;
        }

        container.innerHTML =
            htmlCards;

    } catch (error) {

        console.error(
            "Latest items error:",
            error
        );

        container.innerHTML =
            language === "JP"
                ? "<p>最新アイテムを読み込めませんでした。</p>"
                : "<p>Unable to load latest items.</p>";
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
    localStorage.getItem("lostlinkLanguage") ||
    "EN";

function setLanguage(selectedLanguage) {

    language =
        selectedLanguage;

    localStorage.setItem(
        "lostlinkLanguage",
        language
    );

    updateLanguageButtons();

    applyTranslations();

    if (
        typeof loadLatestItems === "function"
    ) {
        loadLatestItems();
    }

    if (
        typeof loadAllLatestItems === "function"
    ) {
        loadAllLatestItems();
    }
}

function updateLanguageButtons() {

    const enButton =
        document.getElementById("enButton");

    const jpButton =
        document.getElementById("jpButton");

    if (!enButton || !jpButton) {
        return;
    }

    enButton.classList.remove(
        "selected"
    );

    jpButton.classList.remove(
        "selected"
    );

    if (language === "EN") {

        enButton.classList.add(
            "selected"
        );

    } else {

        jpButton.classList.add(
            "selected"
        );
    }
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
            "View all latest items →",

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
            "Git-Hub (temporary)",

        warningText:
            "WARNING: This system tend to have technical errors with Google Chrome (MOBILE).",

        browserText:
            "DEFAULT BROWSER IS RECOMMENDED",

        backHome:
            "← Back to Home",

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
            "メニュー",

        menuSearch:
            "[1] アイテムを検索する",

        menuReport:
            "[2] 落とし物を報告する",

        menuLatest:
            "[3] 報告された落とし物を閲覧する",

        recentTitle:
            "最近報告された落とし物",

        loadingText:
            "読み込み中...",

        viewAllLink:
            "すべての報告された落し物を見る →",

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
            "GitHub（一時的）",

        warningText:
            "警告：このシステムはGoogle Chrome（モバイル）で技術的なエラーが発生します。",

        browserText:
            "デフォルトブラウザの使用をお勧めします",

        backHome:
            "← ホームに戻る",

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
