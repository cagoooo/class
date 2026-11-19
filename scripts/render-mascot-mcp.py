"""透過已安裝的 Blender MCP（stdio、本機迴路、安全模式）渲染安靜挑戰小幫手。

用法：
  python scripts/render-mascot-mcp.py --server <blender-mcp 執行檔> --port 9876 --prompt <使用者原始要求>
  可加 --only owl:calm:0,cat:party:1 只渲染指定格（預覽用），--animals / --moods 篩選，--force 重渲。
"""
import argparse, asyncio, os
from pathlib import Path
from datetime import timedelta
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]
ANIMALS = ['owl', 'cat', 'bear', 'bunny', 'panda']
MOODS = {'off': 4, 'calm': 3, 'sleep': 3, 'doze': 3, 'warn': 3, 'loud': 2, 'storm': 3, 'party': 3}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--server', required=True)
    ap.add_argument('--port', default='9876')
    ap.add_argument('--prompt', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--animals', default='')
    ap.add_argument('--moods', default='')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    env = {**os.environ, 'BLENDER_HOST': '127.0.0.1', 'BLENDER_PORT': args.port, 'BLENDER_MCP_SAFE_MODE': 'true', 'DISABLE_TELEMETRY': 'true'}
    source = (ROOT / 'art/quiet-mascot/build-mascot.py').read_text(encoding='utf-8-sig')
    out = ROOT / 'art/quiet-mascot/renders'; out.mkdir(parents=True, exist_ok=True)
    blends = ROOT / 'art/quiet-mascot/source'; blends.mkdir(exist_ok=True)
    if args.only:
        jobs = [tuple(j.split(':')) for j in args.only.split(',')]
        jobs = [(a, m, int(i)) for a, m, i in jobs]
    else:
        animals = args.animals.split(',') if args.animals else ANIMALS
        moods = args.moods.split(',') if args.moods else list(MOODS)
        jobs = [(a, m, i) for a in animals for m in moods for i in range(MOODS[m])]
    groups = {}
    for a, m, i in jobs:
        dest = out / f'{a}-{m}-{i}.png'
        if args.force or args.only or not dest.exists():
            groups.setdefault((a, m), []).append((i, dest))
    async with stdio_client(StdioServerParameters(command=args.server, env=env)) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=600)) as session:
            await session.initialize()
            for (a, m), items in groups.items():
                code = source
                for i, dest in items:
                    code += f"\nscene=build({a!r},{m!r},{i})\nscene.render.filepath={dest.as_posix()!r}\nbpy.ops.render.render(write_still=True)\n"
                    if m == 'calm' and i == 0:
                        code += f"bpy.ops.wm.save_as_mainfile(filepath={(blends / (a + '.blend')).as_posix()!r},compress=True,copy=True)\n"
                result = await session.call_tool('execute_blender_code', {'code': code, 'user_prompt': args.prompt})
                ok = not result.isError and any('Code executed successfully' in getattr(c, 'text', '') for c in result.content)
                if not ok or any(not d.exists() for _, d in items):
                    raise RuntimeError(result.model_dump_json())
                print(f'RENDER {a} {m} {len(items)}', flush=True)
    print('ALL_RENDERS_COMPLETE', flush=True)

asyncio.run(main())
