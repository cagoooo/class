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
    parser.add_argument('--kinds', default='')
    parser.add_argument('--moods', default='')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--refined', action='store_true')
    parser.add_argument('--grouped', action='store_true', help='Render each species in one MCP request')
    parser.add_argument('--port', default='18765')
    parser.add_argument('--prompt',required=True)
    args=parser.parse_args()
    env={**os.environ,'BLENDER_HOST':'127.0.0.1','BLENDER_PORT':args.port,'BLENDER_MCP_SAFE_MODE':'true','DISABLE_TELEMETRY':'true'}
    async with stdio_client(StdioServerParameters(command=args.server,env=env)) as (read,write):
        async with ClientSession(read,write,read_timeout_seconds=timedelta(seconds=210)) as session:
            await session.initialize()
            if args.batch:
                root=Path(__file__).resolve().parents[1]
                source=(root/'art/pets/build-pets.py').read_text(encoding='utf-8-sig')
                if args.refined:
                    source=source.replace('def build(kind,stage,mood):','def base_build(kind,stage,mood):')+'\n'+(root/'art/pets/evolve-pets.py').read_text(encoding='utf-8-sig')+'\n'+(root/'art/pets/color-pets.py').read_text(encoding='utf-8-sig')+'\n'+(root/'art/pets/refine-pets.py').read_text(encoding='utf-8-sig')
                kinds=['cat','dog','rabbit','panda','fox','bear','penguin','owl','turtle','dragon','capybara','axolotl','lion','tiger','elephant','giraffe','zebra','monkey','koala','redpanda','raccoon','otter','hedgehog','squirrel','sheep','pig','frog','seal','deer','unicorn']
                jobs=[(k,stage,mood) for k in kinds for stage in ['baby','junior','grown'] for mood in (['normal','happy','sleepy','wave','curious'] if args.refined else ['normal','happy','sleepy'])]
                if not args.refined: jobs += [('mystery','egg',stage) for stage in ['rest','crack','splitting','hatching']]
                if args.kinds: jobs=[job for job in jobs if job[0] in args.kinds.split(',')]
                if args.moods: jobs=[job for job in jobs if job[2] in args.moods.split(',')]
                target=root/'art/pets/renders';target.mkdir(exist_ok=True)
                blends=root/'art/pets/source';blends.mkdir(exist_ok=True)
                if args.grouped:
                    for kind in dict.fromkeys(job[0] for job in jobs):
                        selected=[job for job in jobs if job[0]==kind and (args.force or not (target/f'{job[0]}-{job[1]}-{job[2]}.png').exists())]
                        if not selected: continue
                        code=source
                        for _,stage,mood in selected:
                            dest=target/f'{kind}-{stage}-{mood}.png'
                            code+=f"\nscene=build({kind!r},{stage!r},{mood!r})\nscene.render.filepath={dest.as_posix()!r}\nbpy.ops.render.render(write_still=True)\n"
                            if stage=='grown' and mood=='normal':code+=f"bpy.ops.wm.save_as_mainfile(filepath={(blends/(kind+'.blend')).as_posix()!r},compress=True)\n"
                        result=await session.call_tool('execute_blender_code',{'code':code,'user_prompt':args.prompt})
                        if result.isError or not any('Code executed successfully' in getattr(c,'text','') for c in result.content) or any(not (target/f'{k}-{s}-{m}.png').exists() for k,s,m in selected):raise RuntimeError(result.model_dump_json())
                        print(f'RENDER_SPECIES {kind} {len(selected)}',flush=True)
                    print('ALL_RENDERS_COMPLETE',flush=True)
                    return
                for index,(kind,stage,mood) in enumerate(jobs):
                    dest=target/f'{kind}-{stage}-{mood}.png'
                    if dest.exists() and not args.force:continue
                    code=source+f"\nscene=build({kind!r},{stage!r},{mood!r})\nscene.render.filepath={dest.as_posix()!r}\nbpy.ops.render.render(write_still=True)\n"
                    if (stage=='grown' and mood=='normal') or kind=='mystery':code+=f"bpy.ops.wm.save_as_mainfile(filepath={(blends/((kind+'-'+mood if kind=='mystery' else kind)+'.blend')).as_posix()!r},compress=True)\n"
                    result=await session.call_tool('execute_blender_code',{'code':code,'user_prompt':args.prompt})
                    if result.isError or not dest.exists() or not any('Code executed successfully' in getattr(c,'text','') for c in result.content):raise RuntimeError(result.model_dump_json())
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
