function apiBase() {
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return `${protocol}//${hostname}:5000`;
    }
    return "";
}

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

function renderUsuarios(data, eventoFiltro) {
    const tbody = $("#tabela tbody");
    tbody.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
        const tr = document.createElement("tr");
        tr.className = "row-empty";
        tr.innerHTML =
            '<td colspan="4">Nenhum usuário retornado. Verifique a API ou o cadastro no Oracle.</td>';
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
        const ev =
            u.id_evento != null && u.id_evento !== undefined
                ? String(u.id_evento)
                : "—";
        tr.innerHTML = `
            <td>${u.id}</td>
            <td>${escapeHtml(String(u.nome ?? ""))}</td>
            <td class="num narrow">${escapeHtml(ev)}</td>
            <td class="num">R$ ${saldo.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
    const filtroTxt =
        eventoFiltro != null && String(eventoFiltro).trim() !== ""
            ? ` (evento ${String(eventoFiltro).trim()})`
            : "";
    setTableStatus(`${data.length} usuário(s)${filtroTxt}.`, "ok");
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

function usuariosQueryUrl() {
    const raw = $("#eventoId").value.trim();
    if (!raw) return `${API}/usuarios`;
    const n = Number(raw);
    if (Number.isNaN(n) || raw === "") return `${API}/usuarios`;
    const params = new URLSearchParams({ evento_id: String(n) });
    return `${API}/usuarios?${params.toString()}`;
}

function carregarUsuarios() {
    const tbody = $("#tabela tbody");
    const eventoFiltro = $("#eventoId").value.trim();
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    tr.className = "row-loading";
    tr.innerHTML = '<td colspan="4"><span class="skeleton-line"></span></td>';
    tbody.appendChild(tr);
    setTableStatus("Carregando usuários…", "loading");

    fetch(usuariosQueryUrl())
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
            renderUsuarios(data, eventoFiltro);
        })
        .catch((err) => {
            tbody.innerHTML = "";
            const trErr = document.createElement("tr");
            trErr.className = "row-empty row-empty--error";
            trErr.innerHTML = `<td colspan="4">${escapeHtml(friendlyFetchError(err))}</td>`;
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
        const msg =
            data.evento_id != null && data.evento_id !== undefined
                ? `${data.message || "Cashback aplicado."} (evento_id: ${data.evento_id})`
                : data.message || "Cashback aplicado.";
        showToast(msg, "success");
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
    let tUsuarios;
    $("#eventoId").addEventListener("input", () => {
        clearTimeout(tUsuarios);
        tUsuarios = setTimeout(() => carregarUsuarios(), 350);
    });
    carregarUsuarios();
}

init();
