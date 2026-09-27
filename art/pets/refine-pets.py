"""Detailed original pet models. Executed inside the dedicated Blender MCP scene."""
# The MCP client prepends build-pets.py with its build function renamed base_build.

def build(kind, stage, mood):
    scene = base_build(kind, stage, mood if mood in ['normal','happy','sleepy'] else 'normal')
    scene.render.resolution_x = 480
    scene.render.resolution_y = 540
    scene.eevee.taa_render_samples = 32
    scene.view_settings.exposure = -.20
    if stage == 'egg': return scene
    baby = stage == 'baby'
    headz = 1.64 if baby else 1.78
    fur = material(kind, PALETTES[kind][0])
    light = material(kind+'_light', PALETTES[kind][1])
    ink = material('ink',(.025,.045,.08))
    pink = material('blush',(1,.36,.49))
    gold = material('gold',(1,.65,.07))
    # Fine surface grain catches the studio lighting without expensive hair geometry.
    for mat in [fur,light]:
        node = mat.node_tree.nodes.get('Principled BSDF')
        node.inputs['Roughness'].default_value = .52
        if 'Subsurface Weight' in node.inputs: node.inputs['Subsurface Weight'].default_value = .055
        if not mat.node_tree.nodes.get('SoftSurface'):
            noise=mat.node_tree.nodes.new('ShaderNodeTexNoise');noise.name='SoftSurface';noise.inputs['Scale'].default_value=95
            bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.018
            mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],node.inputs['Normal'])
    ink.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.19
    # Delicate brows, secondary glints and toes remain visible at classroom-card size.
    for obj in list(scene.objects):
        if kind == 'panda' and obj.name.startswith(('Eye','HappyEye','ClosedEye')) and not obj.name.startswith('EyePatch'):
            obj.location.y -= .075
        if obj.name.startswith('Eye.') or obj.name == 'Eye':
            obj.scale *= 1.17
            ball('EyeSecondGlint',obj.location+Vector((.022,-.038,-.021)),(.010,.012,.012),material('white',(1,1,1)))
        if obj.name.startswith('Foot'):
            for offset in [-.075,0,.075]:
                ball('ToeDetail',(obj.location.x+offset,-.471,.293),(.025,.022,.034),light)
    y=-.54 if baby else -.51
    if kind in ['monkey','redpanda','raccoon']: y=-.59
    if kind not in ['frog','penguin','owl']:
        for sign in [-1,1]:
            line('SoftBrow',[(sign*.17,y+.02,headz+.19),(sign*.235,y+.006,headz+.215),(sign*.29,y+.022,headz+.195)],light,.014)
    if kind in ['cat','fox','lion','tiger','otter','seal','raccoon','redpanda']:
        for sign in [-1,1]:
            for offset in [-.025,.04]:
                line('FineWhisker',[(sign*.25,-.55,headz-.17+offset),(sign*.45,-.51,headz-.18+offset),(sign*.54,-.46,headz-.16+offset)],light,.009)
    if kind in ['bear','lion','tiger','koala','panda']:
        for sign in [-1,1]:
            ball('EarVelvet',(sign*(.61 if kind=='koala' else .45),-.12,headz+(.24 if kind=='koala' else .4)),(.10,.035,.115),pink if kind!='panda' else light)
    if kind in ['dog','bear','capybara','fox','lion','tiger','otter','deer','squirrel','hedgehog']:
        line('MuzzleSmile',[(-.065,-.623,headz-.235),(0,-.64,headz-.265),(.065,-.623,headz-.235)],ink,.012)
    if kind in ['cat','dog','fox','rabbit','squirrel','deer']:
        # Three sculpted tufts distinguish the silhouette from the smooth base model.
        for j in range(3):
            tuft=cone('ForeheadTuft',((j-1)*.075,.015,headz+.51),(.065,.07,.12),fur)
            tuft.rotation_euler[1]=-.25+j*.20
    if kind in ['owl','penguin','dragon']:
        for sign in [-1,1]:
            for j in range(3):
                line('WingDetail',[(sign*.47,-.17,1.18-j*.09),(sign*.57,-.17,1.10-j*.09)],light,.018)
    if kind=='turtle':
        for j in range(3):
            line('ShellRidge',[(.49,-.01,.68+j*.20),(.61,.06,.77+j*.20),(.59,.24,.84+j*.20)],light,.02)
    if kind=='axolotl':
        for sign in [-1,1]:
            for j in range(3):
                for k in [-1,1]:
                    ball('GillFringe',(sign*(.75+(.08 if j==1 else 0)),0,headz+.25-j*.25+k*.06),(.035,.05,.045),light)
    if kind=='unicorn':
        for j in range(5):
            ball('HornPearl',(.04,-.19,headz+.42+j*.095),(.027,.022,.027),light)
    if stage!='baby':
        # Colorful stitched scarf and embossed medal preserve the existing level gates.
        accent=material('accent_'+kind,tuple(.25+.6*c for c in PALETTES[kind][0]))
        for obj in scene.objects:
            if obj.name.startswith('Scarf'): obj.data.materials[0]=accent
        for j in range(4): ball('ScarfStitch',(.25-j*.013,-.408,1.00+j*.06),(.013,.013,.017),light)
    if stage=='grown':
        for j in range(8):
            angle=math.tau*j/8
            ball('MedalRim',(.116*math.sin(angle),-.514,.91+.116*math.cos(angle)),(.012,.011,.012),light)
    if mood=='wave':
        arms=[o for o in scene.objects if o.name.startswith('Arm')]
        for arm in arms:
            if arm.location.x>0:
                arm.location.z=1.47;arm.rotation_euler[1]=-.95
                ball('GreetingPaw',(.63,-.20,1.62),(.09,.035,.105),pink)
        line('WaveTrail',[(.86,-.1,1.49),(.98,-.1,1.64),(.91,-.1,1.83)],gold,.017)
    headz = evolve_pet(scene,kind,stage,headz,fur,light,gold)
    color_pet(scene,kind,stage)
    if mood=='curious':
        pivot=bpy.data.objects.new('CuriousHeadPivot',None);scene.collection.objects.link(pivot);pivot.location=(0,0,headz)
        bpy.context.view_layer.update()
        # Face, ears and head turn together; the body remains grounded.
        for obj in list(scene.objects):
            if obj is pivot or obj.type not in ['MESH','CURVE'] or obj.name.startswith(('Arm','Wing','Scarf','Shoulder','EvolutionWing','EvolutionFin','EvolutionTail')): continue
            facial_curve = obj.type == 'CURVE' and obj.data.splines and obj.data.splines[0].bezier_points and min(p.co.z for p in obj.data.splines[0].bezier_points) > headz-.36
            if obj.location.z > headz-.36 or facial_curve:
                obj.parent=pivot;obj.matrix_parent_inverse=pivot.matrix_world.inverted()
        pivot.rotation_euler[1]=-.13;pivot.rotation_euler[2]=.055
    return scene
