#!/bin/sh
set -e

DEV_VARS="/app/.dev.vars"

# ── 清空并重建 .dev.vars（wrangler pages dev 从此文件读取 env.*）─────────────
: > "$DEV_VARS"

write_var() {
  _name="$1"
  _value="$2"
  if [ -n "$_value" ]; then
    printf '%s="%s"\n' "$_name" "$_value" >> "$DEV_VARS"
    echo "  [env] $_name = configured"
  fi
}

echo "Configuring environment variables for wrangler..."

# 登录密码（_middleware.ts 读取 env.PASSWORD）
write_var "PASSWORD" "$PASSWORD"

# 音乐 API 地址（functions/proxy.ts 读取 env.API_BASE_URL，未配置时 fallback 到默认节点）
write_var "API_BASE_URL" "$API_BASE_URL"

# Music provider settings. j8y secrets stay server-side in Pages Functions.
write_var "MUSIC_API_PROVIDER" "$MUSIC_API_PROVIDER"
write_var "J8Y_APP_KEY" "$J8Y_APP_KEY"
write_var "J8Y_API_BASE" "$J8Y_API_BASE"
write_var "J8Y_API_PATHS" "$J8Y_API_PATHS"
write_var "J8Y_LEVEL" "$J8Y_LEVEL"

# i18n 语言设置（_middleware.ts 读取 env.language / env.LANGUAGE）
# 支持两种写法：language=ENG 或 LANGUAGE=ENG
_LANG_VALUE="${language:-${LANGUAGE:-}}"
write_var "language" "$_LANG_VALUE"

# ── 确保 D1 持久化目录存在 ────────────────────────────────────────────────────
mkdir -p /data
chmod 755 /data

# ── 打印启动信息 ───────────────────────────────────────────────────────────────
echo ""
echo "  🌟 Solara  (Cloudflare Pages + Wrangler local dev)"
echo "  ────────────────────────────────────────────────────"
echo "  Port      : 8787"
echo "  Data dir  : /data"
if [ -n "$PASSWORD" ]; then
  echo "  Password  : configured"
else
  echo "  Password  : not set (open access)"
fi
echo "  API URL   : ${API_BASE_URL:-https://music-api.gdstudio.xyz/api.php (default)}"
echo "  Provider  : ${MUSIC_API_PROVIDER:-default}"
if [ -n "$J8Y_APP_KEY" ]; then
  echo "  j8y key   : configured"
else
  echo "  j8y key   : not set"
fi
echo "  Language  : ${_LANG_VALUE:-ZH (default)}"
echo "  ────────────────────────────────────────────────────"
echo ""

# ── 启动 wrangler pages dev ───────────────────────────────────────────────────
#   .            → 项目根目录（包含 index.html、css/、js/、functions/ 等）
#   --ip 0.0.0.0 → 允许容器外访问
#   --port 8787  → 绑定端口
#   --d1 DB      → 创建名为 DB 的本地 D1 数据库（与 functions/api/storage.ts 中 env.DB 对应）
#   --persist-to → D1 / KV / R2 数据持久化目录（volume 挂载此路径可跨重启保留数据）
exec wrangler pages dev . \
  --ip 0.0.0.0 \
  --port 8787 \
  --d1 DB \
  --persist-to=/data
