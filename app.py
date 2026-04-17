import os
from pathlib import Path

import oracledb
from flask import Flask, jsonify, make_response, request, send_from_directory

app = Flask(__name__)

# HTML/CSS/JS: use esta pasta (commitada), não `public/` — na Vercel `public/` não entra no zip da função Python.
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"


def get_connection():
    """
    Variáveis de ambiente (ex.: Vercel):
    ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN (ex.: host:1521/servicename)
    """
    user = os.environ.get("ORACLE_USER")
    password = os.environ.get("ORACLE_PASSWORD")
    dsn = os.environ.get("ORACLE_DSN")

    missing = [k for k, v in {"ORACLE_USER": user, "ORACLE_PASSWORD": password, "ORACLE_DSN": dsn}.items() if not v]
    if missing:
        raise RuntimeError(
            "Config do Oracle ausente. Defina as variáveis de ambiente: "
            + ", ".join(missing)
        )

    return oracledb.connect(user=user, password=password, dsn=dsn)


@app.before_request
def _cors_preflight():
    if request.method != "OPTIONS":
        return None
    resp = make_response("", 204)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.after_request
def _cors_headers(resp):
    resp.headers.setdefault("Access-Control-Allow-Origin", "*")
    resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    return resp


@app.route("/", methods=["GET"])
def index_page():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/style.css", methods=["GET"])
def serve_style():
    return send_from_directory(FRONTEND_DIR, "style.css", mimetype="text/css; charset=utf-8")


@app.route("/script.js", methods=["GET"])
def serve_script():
    return send_from_directory(FRONTEND_DIR, "script.js", mimetype="application/javascript; charset=utf-8")


@app.route("/cashback", methods=["POST"])
def aplicar_cashback():
    body = request.get_json(silent=True) or {}
    evento_id = body.get("evento_id")
    if evento_id is None:
        return jsonify(
            {"status": "error", "message": "Informe evento_id no corpo JSON (ex.: {\"evento_id\": 3})."}
        ), 400

    try:
        evento_id = int(evento_id)
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "evento_id deve ser um número inteiro."}), 400

    conn = None
    cursor = None

    plsql = """
    DECLARE
        v_evento_id NUMBER := :evento_id;

        CURSOR c_cashback IS
            SELECT i.ID, i.USUARIO_ID, i.VALOR_PAGO, i.TIPO
            FROM INSCRICOES i
            WHERE i.STATUS = 'PRESENT'
              AND i.ID_EVENTO = v_evento_id;

        rec c_cashback%ROWTYPE;
        v_total_presencas NUMBER;
        v_percentual NUMBER;
        v_cashback NUMBER;

    BEGIN
        OPEN c_cashback;
        LOOP
            FETCH c_cashback INTO rec;
            EXIT WHEN c_cashback%NOTFOUND;

            SELECT COUNT(*)
            INTO v_total_presencas
            FROM INSCRICOES
            WHERE USUARIO_ID = rec.USUARIO_ID
              AND STATUS = 'PRESENT';

            IF v_total_presencas > 3 THEN
                v_percentual := 0.25;
            ELSIF rec.TIPO = 'VIP' THEN
                v_percentual := 0.20;
            ELSE
                v_percentual := 0.10;
            END IF;

            v_cashback := rec.VALOR_PAGO * v_percentual;

            UPDATE USUARIOS
            SET SALDO = NVL(SALDO, 0) + v_cashback
            WHERE ID = rec.USUARIO_ID;

            INSERT INTO LOG_AUDITORIA (INSCRICAO_ID, MOTIVO, DATA)
            VALUES (rec.ID, 'Cashback aplicado: ' || v_cashback, SYSDATE);

        END LOOP;
        CLOSE c_cashback;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            IF c_cashback%ISOPEN THEN
                CLOSE c_cashback;
            END IF;
            ROLLBACK;
            RAISE;
    END;
    """

    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(plsql, evento_id=evento_id)
        return jsonify({"status": "success", "message": "Cashback aplicado com sucesso!"})

    except oracledb.DatabaseError as e:
        err, = e.args
        return jsonify(
            {
                "status": "error",
                "message": f"Erro Oracle: {err.code} - {err.message}",
            }
        ), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@app.route("/usuarios", methods=["GET"])
def listar_usuarios():
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT ID, NOME, SALDO FROM USUARIOS")

        usuarios = []
        for row in cursor.fetchall():
            usuarios.append(
                {
                    "id": row[0],
                    "nome": row[1],
                    "saldo": float(row[2]) if row[2] is not None else 0.0,
                }
            )

        return jsonify(usuarios)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
