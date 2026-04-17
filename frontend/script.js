function apiBase() {
    const { protocol, hostname } = window.location;
    // Local: Flask em outra porta. Produção (ex.: Vercel): mesma origem, rotas na raiz.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return `${protocol}//${hostname}:5000`;
    }
    return "";
}

/** Texto da dica “API em …”: em produção apiBase() é vazio, então mostramos a URL do site. */
function apiHintLabel() {
    const base = apiBase();
    if (base) return base;
    return window.location.origin;
}

const API = apiBase();

function $(sel) {
    return document.querySelector(sel);
}

function showToast(message, variant = "info") {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    el.dataset.variant = variant;
    el.classList.add("toast--show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
        el.classList.remove("toast--show");
        el.hidden = true;
    }, 4200);
}

function setCashbackLoading(loading) {
    const btn = $("#btnCashback");
    btn.disabled = loading;
    btn.classList.toggle("btn--loading", loading);
    btn.setAttribute("aria-busy", loading ? "true" : "false");
}

function setTableStatus(text, kind = "") {
    const st = $("#tableStatus");
    st.textContent = text;
    st.dataset.kind = kind;
}

function renderUsuarios(data) {
    const tbody = $("#tabela tbody");
    tbody.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
        const tr = document.createElement("tr");
        tr.className = "row-empty";
        tr.innerHTML =
            '<td colspan="3">Nenhum usuário retornado. Verifique a API ou o cadastro no Oracle.</td>';
        tbody.appendChild(tr);
        setTableStatus("Lista vazia.", "muted");
        return;
    }

    data.forEach((u) => {
        const tr = document.createElement("tr");
        const saldo =
            typeof u.saldo === "number" && !Number.isNaN(u.saldo)
                ? u.saldo
                : Number(u.saldo) || 0;
        tr.innerHTML = `
            <td>${u.id}</td>
            <td>${escapeHtml(String(u.nome ?? ""))}</td>
            <td class="num">R$ ${saldo.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
    setTableStatus(`${data.length} usuário(s) carregado(s).`, "ok");
}

function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function friendlyFetchError(err) {
    if (err instanceof TypeError && err.message === "Failed to fetch") {
        return (
            "Não foi possível conectar à API. Confira se o Flask está rodando " +
            "(python app.py na raiz do projeto), porta 5000, e se o CORS está ativo."
        );
    }
    return err.message || String(err);
}

function carregarUsuarios() {
    const tbody = $("#tabela tbody");
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    tr.className = "row-loading";
    tr.innerHTML = '<td colspan="3"><span class="skeleton-line"></span></td>';
    tbody.appendChild(tr);
    setTableStatus("Carregando usuários…", "loading");

    fetch(`${API}/usuarios`)
        .then(async (res) => {
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(
                    (data && data.message) || `Falha ao listar usuários (${res.status})`
                );
            }
            return data;
        })
        .then((data) => {
            renderUsuarios(data);
        })
        .catch((err) => {
            tbody.innerHTML = "";
            const trErr = document.createElement("tr");
            trErr.className = "row-empty row-empty--error";
            trErr.innerHTML = `<td colspan="3">${escapeHtml(friendlyFetchError(err))}</td>`;
            tbody.appendChild(trErr);
            setTableStatus("Erro ao carregar.", "error");
            showToast(friendlyFetchError(err), "error");
        });
}

async function aplicarCashback() {
    const eventoId = $("#eventoId").value.trim();
    if (!eventoId) {
        showToast("Informe o ID do evento finalizado.", "error");
        $("#eventoId").focus();
        return;
    }

    setCashbackLoading(true);
    try {
        const res = await fetch(`${API}/cashback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ evento_id: Number(eventoId) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.message || `Falha HTTP ${res.status}`);
        }
        showToast(data.message || "Cashback aplicado.", "success");
        await carregarUsuarios();
    } catch (err) {
        showToast(friendlyFetchError(err), "error");
    } finally {
        setCashbackLoading(false);
    }
}

function init() {
    $("#apiHint").textContent = apiHintLabel();
    $("#btnCashback").addEventListener("click", aplicarCashback);
    $("#btnRefresh").addEventListener("click", carregarUsuarios);
    $("#eventoId").addEventListener("keydown", (e) => {
        if (e.key === "Enter") aplicarCashback();
    });
    carregarUsuarios();
}

init();
