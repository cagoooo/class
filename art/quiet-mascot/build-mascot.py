"""安靜挑戰小幫手：原創程序建模（Blender 5.3 + Blender MCP，安全模式）。

5 隻小幫手（貓頭鷹、小貓、小熊、兔兔、熊貓）× 8 種心情，每種心情 2～4 格動作，
前端把同一心情的格子排成一條，依時間表輪播，做出眨眼、揮手、打呼泡泡、摀耳朵等動作。
只清理專用的 QuietMascotStudio 場景，不動其他場景。
"""
import bpy
import math
from mathutils import Vector, Matrix

ANIMALS = {
    'owl':   dict(fur=(.42, .20, .08), light=(1, .80, .48), dark=(.20, .09, .03), nose=(1, .55, .08), inner=(.99, .86, .64), arm=(.28, .13, .05), feet=(1, .50, .03)),
    'cat':   dict(fur=(1, .42, .05), light=(1, .92, .76), dark=(.75, .20, .02), nose=(1, .42, .55), inner=(1, .45, .58), arm=(1, .42, .05), feet=(1, .93, .80)),
    'bear':  dict(fur=(.45, .19, .06), light=(1, .76, .45), dark=(.30, .12, .04), nose=(.12, .07, .05), inner=(1, .76, .45), arm=(.45, .19, .06), feet=(.36, .15, .05)),
    'bunny': dict(fur=(.96, .95, 1.0), light=(1, .86, .92), dark=(.82, .80, .90), nose=(1, .45, .66), inner=(1, .62, .78), arm=(.96, .95, 1.0), feet=(.96, .95, 1.0)),
    'panda': dict(fur=(.96, .96, .98), light=(1, 1, 1), dark=(.025, .03, .04), nose=(.025, .03, .04), inner=(.025, .03, .04), arm=(.025, .03, .04), feet=(.025, .03, .04)),
}

# 每種心情的動作格（arms = (畫面左手, 畫面右手)）
FRAMES = {
    'off': [
        dict(eyes='open', mouth='smile', arms=('rest', 'wave_out')),
        dict(eyes='open', mouth='smile', arms=('rest', 'wave_in'), roll=.05),
        dict(eyes='open', mouth='smile', arms=('rest', 'rest')),
        dict(eyes='blink', mouth='smile', arms=('rest', 'rest')),
    ],
    'calm': [
        dict(eyes='open', mouth='smile', arms=('belly', 'belly')),
        dict(eyes='blink', mouth='smile', arms=('belly', 'belly')),
        dict(eyes='happy', mouth='smile', arms=('belly', 'belly'), roll=-.07),
    ],
    'sleep': [
        dict(eyes='closed', mouth='snore', arms=('belly', 'belly'), roll=.12, nod=.10, bubble=.07),
        dict(eyes='closed', mouth='snore', arms=('belly', 'belly'), roll=.12, nod=.10, bubble=.12, squash=1.015),
        dict(eyes='closed', mouth='snore', arms=('belly', 'belly'), roll=.12, nod=.10, bubble=.17, squash=1.03),
    ],
    'doze': [
        dict(eyes='half', mouth='flat', arms=('rest', 'rest')),
        dict(eyes='closed', mouth='snore', arms=('rest', 'rest'), nod=.24, roll=.05),
        dict(eyes='open', mouth='oh', arms=('rest', 'rest'), nod=-.06, ears='perk'),
    ],
    'warn': [
        dict(eyes='wide', mouth='oh', arms=('rest', 'shh'), look=-1, ears='perk'),
        dict(eyes='wide', mouth='oh', arms=('rest', 'shh'), look=1, ears='perk'),
        dict(eyes='wide', mouth='oh', arms=('rest', 'shh'), ears='perk', extras=('mark', 'sweat')),
    ],
    'loud': [
        dict(eyes='squeeze', mouth='wave', arms=('cover', 'cover'), lean=.07, roll=.05, ears='flat', extras=('sweat',)),
        dict(eyes='squeeze', mouth='wave', arms=('cover', 'cover'), lean=-.07, roll=-.05, ears='flat', extras=('sweat',)),
    ],
    'storm': [
        dict(eyes='squeeze', mouth='scream', arms=('cover', 'cover'), lean=.10, squash=.93, ears='flat', extras=('anger', 'sweat')),
        dict(eyes='squeeze', mouth='scream', arms=('cover', 'cover'), lean=-.10, squash=1.05, ears='flat', extras=('anger', 'sweat')),
        dict(eyes='squeeze', mouth='scream', arms=('cover', 'cover'), roll=.08, squash=.97, ears='flat', extras=('anger',)),
    ],
    'party': [
        dict(eyes='happy', mouth='grin', arms=('up', 'up'), ears='perk', extras=('sparkle',)),
        dict(eyes='happy', mouth='grin', arms=('wave_out', 'up'), roll=.06, ears='perk', extras=('sparkle',)),
        dict(eyes='happy', mouth='grin', arms=('up', 'wave_out'), roll=-.06, ears='perk', extras=('sparkle',)),
    ],
}

HC = Vector((0, -.04, 1.72))     # 頭的中心
HR = Vector((.80, .68, .66))     # 頭的半徑
NECK = Vector((0, 0, 1.12))
SHOULDER = (.46, -.10, 1.02)
HANDS = {
    'rest': (.70, -.20, .62), 'belly': (.24, -.56, .80), 'cover': (.74, -.16, 1.98),
    'up': (.92, -.14, 2.36), 'wave_out': (1.06, -.20, 2.04), 'wave_in': (.76, -.32, 2.26),
    'shh': (.08, -.84, 1.43),
}


def principled(m):
    """依節點「類型」找 Principled BSDF；Blender 介面是中文時，預設節點名稱也會變成中文。"""
    m.use_nodes = True
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    out = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    if out is None:
        out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return b


def mat(name, color, rough=.5, sheen=0.0, sss=0.0, coat=0.0, emit=0.0, alpha=1.0):
    name = 'QM_' + name
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    b = principled(m)

    def put(key, value):
        if key in b.inputs:
            b.inputs[key].default_value = value
    put('Base Color', (*color, 1)); put('Roughness', rough)
    put('Sheen Weight', sheen); put('Subsurface Weight', sss); put('Coat Weight', coat)
    if emit:
        put('Emission Color', (*color, 1)); put('Emission Strength', emit)
    if alpha < 1:
        put('Alpha', alpha)
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return m


def finish(o, m, subsurf=1):
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    if subsurf:
        mod = o.modifiers.new('Soft', 'SUBSURF'); mod.levels = 1; mod.render_levels = subsurf
    return o


def ball(name, loc, scale, m, quat=None, subsurf=1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale
    if quat is not None:
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = quat
    return finish(o, m, subsurf)


def cone(name, loc, scale, m, rot=(0, 0, 0), tip=.12):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1, radius2=tip, depth=2, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = scale
    bev = o.modifiers.new('Round', 'BEVEL'); bev.width = .12; bev.segments = 3
    return finish(o, m, 1)


def limb(name, a, b, r, m):
    a = Vector(a); b = Vector(b); d = b - a
    o = ball(name, (a + b) / 2, (r, r, d.length / 2 + r * .9), m, quat=d.to_track_quat('Z', 'Y'))
    return o


def line(name, points, m, radius=.022, sharp=False):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = radius; cu.bevel_resolution = 4; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    for pt, co in zip(sp.bezier_points, points):
        pt.co = co
        pt.handle_left_type = pt.handle_right_type = 'VECTOR' if sharp else 'AUTO'
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def surf(x, z, out=0.0, c=None, r=None):
    """頭（或指定橢球）正面的點與法線。"""
    c = HC if c is None else c; r = HR if r is None else r
    nx = x / r.x; nz = (z - c.z) / r.z
    k = max(0.0, 1 - nx * nx - nz * nz)
    y = c.y - r.y * math.sqrt(k)
    n = Vector(((x - c.x) / r.x ** 2, (y - c.y) / r.y ** 2, (z - c.z) / r.z ** 2)).normalized()
    return Vector((x, y, z)) + n * out, n


def on_face(name, x, z, scale, m, out=0.0, c=None, r=None):
    p, n = surf(x, z, out, c, r)
    return ball(name, p, scale, m, quat=n.to_track_quat('-Y', 'Z'))


def studio():
    scene = bpy.data.scenes.get('QuietMascotStudio') or bpy.data.scenes.new('QuietMascotStudio')
    bpy.context.window.scene = scene
    for o in list(scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for item in list(coll):
            if item.users == 0:
                coll.remove(item)
    for m in list(bpy.data.materials):
        if m.name.startswith('QM_') and m.users == 0:
            bpy.data.materials.remove(m)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 24
    scene.render.resolution_x = 400; scene.render.resolution_y = 430; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    world = bpy.data.worlds.get('QuietMascotWorld') or bpy.data.worlds.new('QuietMascotWorld')
    world.use_nodes = True
    nt = world.node_tree
    bg = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeBackground'), None) or nt.nodes.new('ShaderNodeBackground')
    wo = next((n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputWorld'), None) or nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(bg.outputs['Background'], wo.inputs['Surface'])
    bg.inputs[0].default_value = (.80, .86, 1, 1); bg.inputs[1].default_value = .30
    scene.world = world
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = .45
    try:
        scene.view_settings.look = 'AgX - Punchy'
    except Exception:
        pass
    for name, loc, power, size in [('Key', (-3, -5, 6), 650, 4), ('Fill', (4.5, -3, 3), 330, 5), ('Rim', (1.5, 4.5, 5), 900, 3)]:
        d = bpy.data.lights.new('QM_' + name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size
        o = bpy.data.objects.new('QM_' + name, d); scene.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.3)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    cd = bpy.data.cameras.new('QM_Camera'); cam = bpy.data.objects.new('QM_Camera', cd)
    scene.collection.objects.link(cam); cam.location = (1.5, -8, 2.5)
    cam.rotation_euler = (Vector((0, 0, 1.45)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cd.type = 'ORTHO'; cd.ortho_scale = 3.55; scene.camera = cam
    return scene


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if parent:
        o.parent = parent
        o.matrix_parent_inverse = Matrix.Translation(parent.location).inverted()
    return o


def attach(objs, rig):
    inv = Matrix.Translation(rig['rest']).inverted()
    for o in objs:
        o.parent = rig['obj']; o.matrix_parent_inverse = inv


def shadow(scene):
    m = bpy.data.materials.get('QM_shadow')
    if m is None:
        m = bpy.data.materials.new('QM_shadow')
        b = principled(m); nt = m.node_tree
        b.inputs['Base Color'].default_value = (.12, .16, .30, 1); b.inputs['Roughness'].default_value = 1
        tc = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1); ramp.color_ramp.elements[1].position = .7
        ramp.color_ramp.elements[1].color = (.38, .38, .38, 1)
        nt.links.new(tc.outputs['Object'], gr.inputs['Vector']); nt.links.new(gr.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], b.inputs['Alpha'])
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, -.05, .002))
    o = bpy.context.object; o.name = 'QM_Shadow'; o.scale = (.82, .58, 1); o.data.materials.append(m)
    o.visible_shadow = False


def ears(kind, a, mode, M):
    """回傳耳朵物件（跟著頭轉）。mode: normal / perk / flat"""
    out = []
    perk = 1.12 if mode == 'perk' else 1.0
    for s in (-1, 1):
        if kind == 'cat':
            tilt = s * (.55 if mode == 'flat' else .30)
            x = s * (.50 if mode != 'flat' else .60); z = 2.18 if mode != 'flat' else 2.08
            out.append(cone('Ear', (x, .02, z), (.24, .17, .26 * perk), M['fur'], rot=(0, tilt, 0)))
            out.append(cone('InnerEar', (x - s * .01, -.10, z - .02), (.13, .05, .17 * perk), M['inner'], rot=(0, tilt, 0)))
        elif kind == 'owl':
            tilt = s * (.75 if mode == 'flat' else .42)
            out.append(cone('Tuft', (s * .52, .04, 2.22), (.17, .13, .24 * perk), M['dark'], rot=(0, tilt, 0)))
        elif kind in ('bear', 'panda'):
            lift = .05 if mode == 'perk' else (-.06 if mode == 'flat' else 0)
            out.append(ball('Ear', (s * .58, .06, 2.20 + lift), (.23, .17, .22), M['inner'] if kind == 'panda' else M['fur']))
            if kind == 'bear':
                out.append(on_face('InnerEar', s * .58, 2.18 + lift, (.12, .04, .12), M['light'], out=0, c=Vector((s * .58, .06, 2.20 + lift)), r=Vector((.23, .17, .22))))
        elif kind == 'bunny':
            root = Vector((s * .26, .06, 2.20))
            if mode == 'flat':
                tip = Vector((s * .92, .30, 2.42))
            elif mode == 'perk':
                tip = Vector((s * .36, .02, 3.02))
            else:
                tip = Vector((s * .48, .06, 2.92))
            out.append(limb('LongEar', root, tip, .15, M['fur']))
            d = tip - root
            inner = ball('InnerEar', root + d * .55 + Vector((0, -.11, 0)), (.075, .03, d.length * .36), M['inner'], quat=d.to_track_quat('Z', 'Y'))
            out.append(inner)
    return out


def eye(kind, s, f, M, ink, white, shine):
    """s = -1 畫面左眼、1 畫面右眼。"""
    look = f.get('look', 0) * .05
    x = s * .28 + look; z = HC.z - .02
    base_out = .045 if kind == 'owl' else (.03 if kind == 'panda' else 0)
    lw = M['white'] if kind == 'panda' else ink
    e = f['eyes']; o = []

    def pts(P):
        return [surf(px, pz, base_out + .018)[0] for px, pz in P]
    if e == 'open':
        if kind == 'panda':
            o.append(on_face('Sclera', x, z, (.085, .05, .105), white, out=base_out))
        o.append(on_face('Eye', x, z, (.095, .055, .125), M['eye'], out=base_out + .005))
        o.append(on_face('Glint', x - .03, z + .05, (.032, .02, .036), shine, out=base_out + .05))
        o.append(on_face('Glint2', x + .028, z - .045, (.016, .01, .018), shine, out=base_out + .05))
    elif e == 'wide':
        o.append(on_face('Sclera', x, z + .01, (.125, .05, .15), white, out=base_out))
        o.append(on_face('Pupil', x + look * .6, z, (.05, .04, .062), M['eye'], out=base_out + .03))
        o.append(on_face('Glint', x - .015 + look * .6, z + .025, (.018, .012, .02), shine, out=base_out + .065))
    elif e == 'half':
        o.append(on_face('Eye', x, z - .035, (.095, .05, .07), M['eye'], out=base_out + .005))
        o.append(line('Lid', pts([(x - .11, z + .02), (x, z + .035), (x + .11, z + .02)]), lw, .02))
    elif e in ('closed', 'blink'):
        dip = .045 if e == 'closed' else .02
        o.append(line('Closed', pts([(x - .10, z + .01), (x, z - dip), (x + .10, z + .01)]), lw, .022))
    elif e == 'happy':
        o.append(line('Happy', pts([(x - .10, z - .04), (x, z + .06), (x + .10, z - .04)]), lw, .025))
    elif e == 'squeeze':
        o.append(line('Squeeze', pts([(x - s * .08, z + .075), (x + s * .07, z), (x - s * .08, z - .075)]), lw, .024, sharp=True))
    return o


def mouth(kind, f, M, ink):
    muz = kind in ('bear', 'panda', 'cat')
    mc = Vector((0, HC.y - HR.y * .80, 1.47)); mr = Vector((.27, .16, .19))
    z = 1.40
    if muz:
        p, _ = surf(0, 1.47, 0)
        mc = Vector((0, p.y + .06, 1.47))
    c, r = (mc, mr) if muz else (None, None)
    def on(name, x, zz, sc, m, out=0):
        return on_face(name, x, zz, sc, m, out=out, c=c, r=r)

    def pts(P, out=.014):
        return [surf(px, pz, out, c, r)[0] for px, pz in P]
    o = []
    if muz:
        o.append(ball('Muzzle', mc, mr, M['light']))
    # 鼻子
    if kind == 'owl':
        p, n = surf(0, 1.55, .02)
        o.append(cone('Beak', p, (.075, .075, .10), M['nose'], rot=(math.radians(-115), 0, 0), tip=.05))
    else:
        sc = {'bear': (.08, .06, .055), 'panda': (.08, .06, .055), 'cat': (.055, .045, .04), 'bunny': (.05, .04, .035)}[kind]
        o.append(on('Nose', 0, 1.53, sc, M['nose'] if kind != 'bear' else ink, out=.01))
    mm = f['mouth']
    if mm == 'smile':
        o.append(line('Smile', pts([(-.10, z + .025), (-.05, z - .03), (0, z + .005), (.05, z - .03), (.10, z + .025)]), ink, .018))
    elif mm == 'flat':
        o.append(line('Flat', pts([(-.06, z - .01), (.06, z - .01)]), ink, .018, sharp=True))
    elif mm == 'wave':
        P = [(-.12 + i * .04, z - .02 + (.025 if i % 2 else -.02)) for i in range(7)]
        o.append(line('Wave', pts(P), ink, .017, sharp=True))
    elif mm == 'snore':
        o.append(on('Snore', 0, z - .02, (.04, .03, .045), M['mouthin']))
    elif mm == 'oh':
        o.append(on('Oh', 0, z - .03, (.05, .035, .065), M['mouthin']))
    elif mm == 'scream':
        o.append(on('Scream', 0, z - .07, (.12, .05, .14), M['mouthin']))
        o.append(on('Tongue', 0, z - .14, (.075, .03, .05), M['tongue'], out=.012))
    elif mm == 'grin':
        o.append(on('Grin', 0, z - .04, (.12, .045, .085), M['mouthin']))
        o.append(on('Tongue', 0, z - .085, (.07, .03, .04), M['tongue'], out=.012))
    if kind == 'cat':
        for s in (-1, 1):
            for dz in (.03, -.04):
                a = surf(s * .30, 1.47 + dz, .01)[0]
                o.append(line('Whisker', [a, a + Vector((s * .30, -.02, dz * 1.6))], M['ink_soft'], .008))
    return o


def build(kind, mood, index):
    scene = studio()
    a = ANIMALS[kind]; f = FRAMES[mood][index]
    M = {
        'fur': mat(kind + '_fur', a['fur'], rough=.55, sheen=.12, sss=.06),
        'light': mat(kind + '_light', a['light'], rough=.55, sheen=.10, sss=.04),
        'dark': mat(kind + '_dark', a['dark'], rough=.5, sheen=.05),
        'inner': mat(kind + '_inner', a['inner'], rough=.5, sheen=.08),
        'arm': mat(kind + '_arm', a['arm'], rough=.55, sheen=.08 if kind == 'panda' else .12, sss=.04),
        'feet': mat(kind + '_feet', a['feet'], rough=.5, sheen=.08),
        'nose': mat(kind + '_nose', a['nose'], rough=.25, coat=.6),
        'eye': mat('eye', (.02, .025, .05), rough=.08, coat=1),
        'white': mat('white', (1, 1, 1), rough=.3),
        'shine': mat('shine', (1, 1, 1), emit=2.5),
        'blush': mat('blush', (1, .35, .45), rough=.7, alpha=.75),
        'mouthin': mat('mouthin', (.22, .03, .07), rough=.4),
        'tongue': mat('tongue', (1, .38, .45), rough=.4),
        'ink': mat('ink', (.03, .03, .06), rough=.4),
        'ink_soft': mat('ink_soft', (.30, .22, .20), rough=.5),
        'sweat': mat('sweat', (.35, .70, 1), rough=.05, coat=1, alpha=.85),
        'bubble': mat('bubble', (.70, .90, 1), rough=.02, coat=1, alpha=.45),
        'anger': mat('anger', (1, .15, .20), rough=.35),
        'mark': mat('mark', (1, .45, .05), rough=.35),
        'gold': mat('gold', (1, .78, .15), rough=.25, emit=.6),
    }
    ink = M['ink']
    shadow(scene)

    root = {'obj': empty('QM_Root', (0, 0, 0)), 'rest': Vector((0, 0, 0))}
    head = {'obj': empty('QM_HeadRig', NECK), 'rest': NECK}
    body_parts = []; head_parts = []

    # 身體
    body_parts.append(ball('Body', (0, 0, .70), (.60, .52, .60), M['fur']))
    if kind != 'panda':
        body_parts.append(ball('Belly', (0, -.40, .66), (.40, .16, .44), M['light']))
    if kind == 'owl':
        for x, z in ((-.13, .82), (.13, .82), (0, .64)):
            body_parts.append(line('Feather', [Vector((x - .07, -.565, z + .03)), Vector((x, -.585, z - .03)), Vector((x + .07, -.565, z + .03))], M['dark'], .014))
    for s in (-1, 1):
        body_parts.append(ball('Foot', (s * .30, -.26, .14), (.21, .27, .13), M['feet']))
    if kind == 'cat':
        body_parts.append(line('Tail', [Vector((.35, .40, .35)), Vector((.80, .45, .55)), Vector((.92, .40, 1.05)), Vector((.78, .35, 1.25))], M['fur'], .085))
        body_parts.append(ball('TailTip', (.78, .35, 1.28), (.10, .10, .10), M['dark']))
    if kind == 'bunny':
        body_parts.append(ball('Tail', (.30, .50, .45), (.17, .17, .17), M['fur']))

    # 手
    for s, pose in zip((-1, 1), f['arms']):
        sh = Vector((s * SHOULDER[0], SHOULDER[1], SHOULDER[2]))
        hx, hy, hz = HANDS[pose]
        hand = Vector((s * hx, hy, hz))
        if pose == 'shh':
            hand = Vector((hx * s * .2, hy, hz))
        armm = M['arm'] if kind != 'owl' else M['dark']
        r = .15 if kind != 'owl' else .14
        body_parts.append(limb('Arm', sh, hand, r, armm))
        body_parts.append(ball('Paw', hand, (r * 1.12, r * 1.05, r * 1.12), armm))
        if pose == 'shh':
            tip = hand + Vector((0, -.06, .22))
            body_parts.append(limb('Finger', hand + Vector((0, -.05, .05)), tip, .055, armm))

    # 頭
    head_parts.append(ball('Head', HC, HR, M['fur']))
    if kind == 'owl':
        for s in (-1, 1):
            head_parts.append(on_face('FaceDisk', s * .28, HC.z - .02, (.23, .05, .25), M['light'], out=0))
    if kind == 'cat':
        for i, x in enumerate((-.13, 0, .13)):
            p0 = surf(x, 2.26, .012)[0]; p1 = surf(x * .9, 2.12, .012)[0]
            head_parts.append(line('Stripe', [p0, p1], M['dark'], .028))
    if kind == 'panda':
        for s in (-1, 1):
            p, n = surf(s * .28, HC.z - .03, 0)
            patch = ball('EyePatch', p, (.15, .05, .19), M['dark'], quat=n.to_track_quat('-Y', 'Z'))
            patch.rotation_mode = 'XYZ'
            patch.rotation_euler.y += s * -.45   # 熊貓眼斑往外下斜
            head_parts.append(patch)
    head_parts += ears(kind, a, f.get('ears', 'normal'), M)
    for s in (-1, 1):
        head_parts += eye(kind, s, f, M, ink, M['white'], M['shine'])
        if kind != 'owl':
            head_parts.append(on_face('Blush', s * .52, HC.z - .20, (.10, .03, .06), M['blush'], out=.005))
        else:
            head_parts.append(on_face('Blush', s * .55, HC.z - .22, (.09, .03, .05), M['blush'], out=.005))
    head_parts += mouth(kind, f, M, ink)

    # 小道具
    extras = f.get('extras', ())
    if f.get('bubble'):
        p = surf(.07, 1.50, .02 + f['bubble'] * .8)[0]
        head_parts.append(ball('SnotBubble', p, (f['bubble'],) * 3, M['bubble']))
        head_parts.append(ball('BubbleShine', p + Vector((-f['bubble'] * .35, -f['bubble'] * .9, f['bubble'] * .35)), (f['bubble'] * .18,) * 3, M['shine']))
    if 'sweat' in extras:
        p = Vector((.74, -.40, 2.12))
        head_parts.append(ball('Sweat', p, (.065, .05, .085), M['sweat']))
        head_parts.append(cone('SweatTip', p + Vector((0, 0, .09)), (.045, .035, .06), M['sweat'], tip=.02))
    if 'anger' in extras:
        c = Vector((-.62, -.48, 2.22))
        for ang in (0, 1, 2, 3):
            t = ang * math.pi / 2 + math.pi / 4
            d = Vector((math.cos(t), 0, math.sin(t)))
            q = Vector((-d.z, 0, d.x))
            head_parts.append(line('Anger', [c + d * .05 + q * .06, c + d * .11, c + d * .05 - q * .06], M['anger'], .028))
    if 'mark' in extras:
        head_parts.append(limb('Mark', (.86, -.30, 2.42), (.82, -.30, 2.66), .045, M['mark']))
        head_parts.append(ball('MarkDot', (.88, -.30, 2.30), (.05, .05, .05), M['mark']))
    if 'sparkle' in extras:
        for x, z, k in ((-1.15, 2.45, 1), (1.18, 1.25, .8), (-1.05, 1.15, .7)):
            body_parts.append(ball('SparkV', (x, -.3, z), (.035 * k, .03, .14 * k), M['gold']))
            body_parts.append(ball('SparkH', (x, -.3, z), (.12 * k, .03, .035 * k), M['gold']))

    attach(head_parts, head)
    head['obj'].parent = root['obj']
    attach(body_parts, root)
    head['obj'].rotation_euler = (f.get('nod', 0), f.get('roll', 0), 0)
    sq = f.get('squash', 1.0)
    root['obj'].scale = (1 / math.sqrt(sq), 1 / math.sqrt(sq), sq)
    root['obj'].rotation_euler = (0, f.get('lean', 0), 0)
    return scene


def frame_count(mood):
    return len(FRAMES[mood])
