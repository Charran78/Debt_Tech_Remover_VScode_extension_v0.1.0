import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// ── Helpers ──────────────────────────────────────────────────────────────────

function findAsset(dir: string, pattern: RegExp) {
  const files = fs.readdirSync(dir)
  const match = files.find((f: string) => pattern.test(f))
  if (!match) throw new Error('No se encontró el asset: ' + pattern.source)
  return match
}

function escapeAttr(val: string) {
  return val.replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Webview HTML ──────────────────────────────────────────────────────────────

function getWebviewHtml(webview: vscode.Webview, extUri: vscode.Uri, apiKey: string) {
  const mediaDir = vscode.Uri.joinPath(extUri, 'media')
  const assetsFsPath = path.join(vscode.Uri.joinPath(extUri, 'media').fsPath, 'assets')
  const jsFile = findAsset(assetsFsPath, /^index.*\.js$/)
  const cssFile = findAsset(assetsFsPath, /^index.*\.css$/)

  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'assets', jsFile))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'assets', cssFile))
  const nonce = crypto.randomBytes(16).toString('base64')

  // CSP más permisivo para depuración, pero manteniendo seguridad base.
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'`,
    `img-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource} https: data:`,
    `connect-src ${webview.cspSource} https://generativelanguage.googleapis.com https://r.jina.ai https://api.gumroad.com`
  ].join('; ')

  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<link rel="stylesheet" href="${styleUri}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Debt Tech Remover</title>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script nonce="${nonce}">
      // Intentar adquirir la API de VS Code una sola vez
      if (typeof acquireVsCodeApi === 'function') {
        window.vscode = acquireVsCodeApi();
      }
      window.__GEMINI_API_KEY__='${escapeAttr(apiKey)}';
    </script>`,
    `<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`,
    '</body>',
    '</html>'
  ].join('')
}

// ── Trial & License ───────────────────────────────────────────────────────────

const TRIAL_DAYS = 30
const GUMROAD_PRODUCT_ID = 'dhpzdr'

type GumroadLicenseResponse = {
  success: boolean
  uses: number
  purchase: {
    id: string
    subscription_id: string | null
    subscription_ended_at: string | null      // null = suscripción activa o compra única
    subscription_cancelled_at: string | null
    subscription_failed_at: string | null
  }
}

async function validateGumroadLicense(key: string | undefined): Promise<boolean> {
  if (!key) return false
  try {
    const res = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: GUMROAD_PRODUCT_ID,
        license_key: key
        // Para llevar contador de usos, descomenta: increment_uses_count: 'true'
      }).toString()
    })
    const data = await res.json() as GumroadLicenseResponse

    // La licencia debe ser válida Y la suscripción no debe haber terminado.
    // Para compras únicas (sin subscription_id), subscription_ended_at es null o undefined → permitido.
    const subEnded = data.purchase?.subscription_ended_at
    const subscriptionOk = subEnded === null || subEnded === undefined
    return data.success === true && subscriptionOk
  } catch {
    return false
  }
}

function isTrialActive(firstRunDate: number | undefined): boolean {
  if (!firstRunDate) return true
  const daysElapsed = (Date.now() - firstRunDate) / 86_400_000
  return daysElapsed < TRIAL_DAYS
}

function getLicenseScreenHtml(daysLeft: number) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activar Licencia — Debt Tech Remover</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #020617; color: #e2e8f0; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px;
            padding: 40px; max-width: 480px; width: 90%; text-align: center; }
    h1 { color: #f1f5f9; font-size: 1.4rem; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 0.9rem; line-height: 1.6; }
    .badge { display: inline-block; background: #f59e0b22; border: 1px solid #f59e0b55;
             color: #fbbf24; border-radius: 8px; padding: 4px 12px; font-size: 0.8rem; margin-bottom: 20px; }
    input { width: 100%; background: #020617; border: 1px solid #334155; border-radius: 10px;
            padding: 12px 16px; color: white; font-size: 0.9rem; box-sizing: border-box;
            margin: 16px 0 8px; outline: none; }
    input:focus { border-color: #10b981; }
    button { width: 100%; background: #059669; color: white; border: none; border-radius: 10px;
             padding: 13px; font-size: 0.95rem; font-weight: 600; cursor: pointer;
             margin-top: 8px; transition: background 0.2s; }
    button:hover { background: #10b981; }
    a { color: #10b981; text-decoration: none; font-size: 0.85rem; display: block; margin-top: 16px; }
    a:hover { text-decoration: underline; }
    #msg { font-size: 0.85rem; min-height: 20px; margin-top: 8px; }
    .err { color: #f87171; } .ok { color: #34d399; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⏱ Período de prueba finalizado</div>
    <h1>Activa tu licencia</h1>
    <p>Tu prueba gratuita de <strong>${TRIAL_DAYS} días</strong> ha concluido.<br>
       Introduce tu License Key de Gumroad para continuar.</p>
    <input id="key" type="text" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" />
    <button onclick="activate()">Activar licencia</button>
    <p id="msg"></p>
    <a href="https://gumroad.com" target="_blank">🛒 Obtener una licencia (5-9€/mes)</a>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function activate() {
      const key = document.getElementById('key').value.trim();
      if (!key) { setMsg('Introduce una clave válida.', false); return; }
      vscode.postMessage({ type: 'activateLicense', key });
    }
    window.addEventListener('message', e => {
      if (e.data?.type === 'licenseResult') {
        setMsg(e.data.success ? '✅ Licencia activada. Reinicia la extensión.' : '❌ Clave no válida.', e.data.success);
      }
    });
    function setMsg(t, ok) {
      const el = document.getElementById('msg');
      el.textContent = t;
      el.className = ok ? 'ok' : 'err';
    }
  </script>
</body>
</html>`
}

// ── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {

  let currentPanel: vscode.WebviewPanel | undefined = undefined

  // ── Comando principal: abrir la app ───────────────────────────────────────
  const openCommand = vscode.commands.registerCommand('debtTechRemover.open', () => {
    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.One)
      return
    }

    ; (async () => {
      // Gestión del trial
      let firstRunDate = context.globalState.get<number>('firstRunDate')
      if (!firstRunDate) {
        firstRunDate = Date.now()
        await context.globalState.update('firstRunDate', firstRunDate)
      }

      const licenseKey = await context.secrets.get('gumroadLicense')
      const trialOk = isTrialActive(firstRunDate)
      const licensed = await validateGumroadLicense(licenseKey)

      const panel = vscode.window.createWebviewPanel(
        'debtTechRemover',
        'Debt Tech Remover',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
          retainContextWhenHidden: true
        }
      )
      currentPanel = panel

      panel.onDidDispose(() => {
        currentPanel = undefined
      }, null, context.subscriptions)

      // Si el trial expiró y no hay licencia válida → pantalla de activación
      if (!trialOk && !licensed) {
        const daysLeft = 0
        panel.webview.html = getLicenseScreenHtml(daysLeft)
        panel.webview.onDidReceiveMessage(async (message) => {
          if (message?.type === 'activateLicense') {
            const valid = await validateGumroadLicense(message.key)
            if (valid) {
              await context.secrets.store('gumroadLicense', message.key)
            }
            panel.webview.postMessage({ type: 'licenseResult', success: valid })
          }
        })
        return
      }

      try {
        // App normal
        const apiKey = await getApiKey(context)
        panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, apiKey)

        panel.webview.onDidReceiveMessage(async (message) => {
          // Reconfigurar API Key de Gemini
          if (message?.type === 'configureKey') {
            const entered = await vscode.window.showInputBox({ password: true, placeHolder: 'Introduce tu Gemini API Key' })
            const val = entered?.trim()
            if (!val) return
            await context.secrets.store('geminiApiKey', val)
            panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, val)
          }

          // Guardar contract.md en el workspace
          if (message?.type === 'saveContract') {
            const folders = vscode.workspace.workspaceFolders
            if (!folders?.length) {
              vscode.window.showWarningMessage(
                'No hay carpeta de workspace abierta. Copia el contrato manualmente con el botón "Copiar Markdown".'
              )
              return
            }
            const contractUri = vscode.Uri.joinPath(folders[0].uri, 'contract.md')
            const content = Buffer.from(message.content as string, 'utf8')
            await vscode.workspace.fs.writeFile(contractUri, content)
            vscode.window.showInformationMessage('✅ contract.md guardado en la raíz del workspace.')
          }

          // Activar licencia desde pantalla de trial (flujo alternativo)
          if (message?.type === 'activateLicense') {
            const valid = await validateGumroadLicense(message.key)
            if (valid) await context.secrets.store('gumroadLicense', message.key)
            panel.webview.postMessage({ type: 'licenseResult', success: valid })
          }

          // Escaneo profundo del workspace para grounding agnóstico
          if (message?.type === 'scanWorkspace') {
            try {
              const projectContext = await collectWorkspaceContext()
              panel.webview.postMessage({ type: 'workspaceScanned', content: projectContext })
            } catch (err: any) {
              vscode.window.showErrorMessage(`Error al escanear el workspace: ${err.message}`)
              panel.webview.postMessage({ type: 'workspaceScanned', content: '', error: err.message })
            }
          }
        })
      } catch (err: any) {
        panel.webview.html = `<html><body><pre>Error al iniciar la extensión:\n${err.message || err}</pre></body></html>`
      }
    })().catch(err => {
      console.error('Error fatal en Debt Tech Remover:', err)
    })
  })
  context.subscriptions.push(openCommand)

  // ── Configurar API Key de Gemini ─────────────────────────────────────────
  const configureKey = vscode.commands.registerCommand('debtTechRemover.configureKey', async () => {
    const entered = await vscode.window.showInputBox({ password: true, placeHolder: 'Introduce tu Gemini API Key' })
    if (!entered) return
    await context.secrets.store('geminiApiKey', entered)
    vscode.window.showInformationMessage('✅ API Key de Gemini guardada correctamente.')
  })
  context.subscriptions.push(configureKey)

  // ── Activar licencia Gumroad (comando de paleta) ─────────────────────────
  const activateLicense = vscode.commands.registerCommand('debtTechRemover.activateLicense', async () => {
    const key = await vscode.window.showInputBox({ placeHolder: 'Introduce tu License Key de Gumroad' })
    if (!key) return
    const valid = await validateGumroadLicense(key.trim())
    if (valid) {
      await context.secrets.store('gumroadLicense', key.trim())
      vscode.window.showInformationMessage('✅ Licencia activada correctamente. ¡Gracias!')
    } else {
      vscode.window.showErrorMessage('❌ Clave de licencia no válida. Comprueba que es correcta.')
    }
  })
  context.subscriptions.push(activateLicense)
}

export function deactivate() { }

// ── Private helpers ───────────────────────────────────────────────────────────

async function getApiKey(context: vscode.ExtensionContext): Promise<string> {
  const existing = (await context.secrets.get('geminiApiKey'))?.trim()
  if (existing) return existing
  const entered = await vscode.window.showInputBox({ password: true, placeHolder: 'Introduce tu Gemini API Key' })
  const val = entered?.trim()
  if (!val) throw new Error('No se proporcionó API Key')
  await context.secrets.store('geminiApiKey', val)
  return val
}

async function collectWorkspaceContext(): Promise<string> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) return 'Sin workspace abierto.'

  const signatures = [
    'package.json', 'requirements.txt', 'setup.py', 'Pipfile', 'go.mod',
    'Cargo.toml', 'pom.xml', 'build.gradle', 'mix.exs', 'composer.json',
    'Gemfile', 'README.md', 'main.py', 'app.py', 'index.tsx',
    'App.tsx', 'lib.rs', 'main.go', 'index.js'
  ]

  let context = '--- DATA DNA DEL PROYECTO ---\n\n'

  for (const sig of signatures) {
    const files = await vscode.workspace.findFiles(`**/${sig}`, '**/node_modules/**')
    if (files.length > 0) {
      const file = files[0]
      try {
        const content = await vscode.workspace.fs.readFile(file)
        const text = Buffer.from(content).toString('utf8').substring(0, 5000)
        context += `### ARCHIVO: ${vscode.workspace.asRelativePath(file)}\n\`\`\`\n${text}\n\`\`\`\n\n`
      } catch (e) {
        console.error(`Error leyendo ${file.fsPath}:`, e)
      }
    }
  }

  return context
}
