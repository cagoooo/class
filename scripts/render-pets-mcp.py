"""Run the installed Blender MCP over stdio on a dedicated loopback port."""
import argparse, asyncio, json, os
from pathlib import Path
from datetime import timedelta
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--server', required=True)
    parser.add_argument('--code')
    parser.add_argument('--batch',action='store_true')
    parser.add_argument('--prompt',required=True)
    args=parser.parse_args()
    env={**os.environ,'BLENDER_HOST':'127.0.0.1','BLENDER_PORT':'18765','BLENDER_MCP_SAFE_MODE':'true','DISABLE_TELEMETRY':'true'}
    async with stdio_client(StdioServerParameters(command=args.server,env=env)) as (read,write):
        async with ClientSession(read,write,read_timeout_seconds=timedelta(seconds=210)) as session:
            await session.initialize()
            if args.batch:
                root=Path(__file__).resolve().parents[1]
                source=(root/'art/pets/build-pets.py').read_text(encoding='utf-8-sig')
                kinds=['cat','dog','rabbit','panda','fox','bear','penguin','owl','turtle','dragon','capybara','axolotl']
                jobs=[(k,stage,mood) for k in kinds for stage in ['egg','baby','junior','grown'] for mood in (['normal'] if stage=='egg' else ['normal','happy','sleepy'])]
                jobs.append(('mystery','egg','normal'))
                target=root/'art/pets/renders';target.mkdir(exist_ok=True)
                blends=root/'art/pets/source';blends.mkdir(exist_ok=True)
                for index,(kind,stage,mood) in enumerate(jobs):
                    dest=target/f'{kind}-{stage}-{mood}.png'
                    if dest.exists():continue
                    code=source+f"\nscene=build({kind!r},{stage!r},{mood!r})\nscene.render.filepath={dest.as_posix()!r}\nbpy.ops.render.render(write_still=True)\n"
                    if stage=='grown' and mood=='normal':code+=f"bpy.ops.wm.save_as_mainfile(filepath={(blends/(kind+'.blend')).as_posix()!r},compress=True)\n"
                    result=await session.call_tool('execute_blender_code',{'code':code,'user_prompt':args.prompt})
                    if result.isError or not dest.exists():raise RuntimeError(result.model_dump_json())
                    print(f'RENDER {index+1}/{len(jobs)} {dest.name}',flush=True)
                print('ALL_RENDERS_COMPLETE',flush=True)
            else:
                tool='execute_blender_code' if args.code else 'get_scene_info'
                inputs={'user_prompt':args.prompt}
                if args.code: inputs['code']=Path(args.code).read_text(encoding='utf-8-sig')
                result=await session.call_tool(tool,inputs)
                print(result.model_dump_json(),flush=True)
                if result.isError: raise RuntimeError('MCP tool failed')
asyncio.run(main())
