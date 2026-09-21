"""Original classroom pets, modeled procedurally through Blender MCP (safe mode)."""
import bpy
import math
from mathutils import Vector

PALETTES = {
 'mystery':((.46,.66,.79),(.96,.98,1.0)),
 'cat':((0.94,0.54,0.20),(1.0,0.86,0.63)),
 'dog':((0.57,0.31,0.16),(0.98,0.79,0.53)),
 'rabbit':((0.76,0.61,0.91),(0.98,0.89,1.0)),
 'panda':((0.92,0.96,1.0),(0.12,0.17,0.23)),
 'fox':((0.98,0.29,0.08),(1.0,0.89,0.69)),
 'bear':((0.65,0.36,0.15),(1.0,0.77,0.44)),
 'penguin':((0.12,0.27,0.39),(0.95,0.98,1.0)),
 'owl':((0.46,0.32,0.65),(0.92,0.82,1.0)),
 'turtle':((0.23,0.63,0.42),(0.75,0.93,0.53)),
 'dragon':((0.16,0.63,0.70),(0.83,0.95,0.66)),
 'capybara':((0.68,0.46,0.28),(0.89,0.72,0.47)),
 'axolotl':((0.99,0.62,0.74),(1.0,0.86,0.90)),
 'lion':((.96,.58,.15),(1,.85,.48)),
 'tiger':((1,.40,.065),(1,.85,.64)),
 'elephant':((.43,.58,.73),(.77,.85,.97)),
 'giraffe':((.97,.72,.23),(1,.91,.66)),
 'zebra':((.88,.93,.98),(.20,.28,.37)),
 'monkey':((.48,.24,.10),(.95,.74,.51)),
 'koala':((.50,.62,.69),(.88,.91,.92)),
 'redpanda':((.75,.22,.09),(1,.86,.62)),
 'raccoon':((.40,.51,.58),(.83,.90,.92)),
 'otter':((.42,.28,.16),(.92,.77,.56)),
 'hedgehog':((.69,.49,.33),(.99,.87,.66)),
 'squirrel':((.74,.38,.16),(1,.81,.54)),
 'sheep':((.92,.86,.73),(1,.97,.89)),
 'pig':((1,.57,.66),(1,.80,.83)),
 'frog':((.28,.74,.27),(.84,.97,.53)),
 'seal':((.65,.79,.89),(.96,.99,1)),
 'deer':((.70,.41,.18),(1,.86,.58)),
 'unicorn':((.83,.72,.97),(.99,.93,1))
}

def material(name,color):
    name='ClassPets_'+name
    mat=bpy.data.materials.get(name)
    if mat is None:
        mat=bpy.data.materials.new(name)
        mat.diffuse_color=(*color,1)
        mat.use_nodes=True
        node=mat.node_tree.nodes.get('Principled BSDF')
        node.inputs['Base Color'].default_value=(*color,1)
        node.inputs['Roughness'].default_value=0.38
    return mat

def ball(name,loc,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=scale;obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

def cone(name,loc,scale,mat):
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=1,radius2=0.10,depth=2,location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=scale;obj.data.materials.append(mat)
    bevel=obj.modifiers.new('SoftEdges','BEVEL');bevel.width=.14;bevel.segments=3
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

def line(name,points,mat,radius=.025):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=3
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,coords in zip(spline.bezier_points,points):
        point.co=coords;point.handle_left_type='AUTO';point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve);bpy.context.scene.collection.objects.link(obj);obj.data.materials.append(mat)
    return obj

def studio():
    scene=bpy.data.scenes.get('ClassPetsStudio')
    if scene is None:scene=bpy.data.scenes.new('ClassPetsStudio')
    bpy.context.window.scene=scene
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users==0:bpy.data.meshes.remove(mesh)
    for curve in list(bpy.data.curves):
        if curve.users==0:bpy.data.curves.remove(curve)
    try:scene.render.engine='BLENDER_EEVEE'
    except TypeError:scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples=16
    scene.render.resolution_x=320;scene.render.resolution_y=360;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.world=bpy.data.worlds.get('ClassPetsWorld') or bpy.data.worlds.new('ClassPetsWorld')
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.68,.78,1,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
    scene.view_settings.view_transform='AgX'
    for name,loc,power,size in [('Key',(-3,-4,6),550,4),('Fill',(4,-2,4),380,4),('Rim',(1,4,5),650,3)]:
        data=bpy.data.lights.new('CP_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new('CP_'+name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1.3))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.cameras.new('CP_Camera');cam=bpy.data.objects.new('CP_Camera',camera);scene.collection.objects.link(cam);cam.location=(2.7,-7,3.4)
    cam.rotation_euler=(Vector((0,0,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();camera.type='ORTHO';camera.ortho_scale=3.65;scene.camera=cam
    return scene

def build(kind,stage,mood):
    scene=studio();colors=PALETTES[kind]
    fur=material(kind,colors[0]);cream=material(kind+'_light',colors[1]);dark=material('ink',(.025,.045,.08));white=material('white',(1,1,1));pink=material('blush',(1,.36,.49));gold=material('gold',(1,.65,.07));mint=material('mint',(.06,.56,.45))
    ball('Pedestal',(0,.06,.09),(.83,.68,.08),material('base',(.67,.85,.86)))
    if stage=='egg':
        if kind!='mystery' or mood in ['normal','rest']:
            ball('Egg',(0,0,1.03),(.60,.53,.85),cream)
        else:
            # Ellipsoid shell split along a jagged rim; a solidify modifier gives thickness.
            opening={'crack':.00,'splitting':.065,'hatching':.25}[mood]
            for cap in [False,True]:
                vertices=[];faces=[];rings=16;segments=64
                for row in range(rings+1):
                    t=row/rings
                    for col in range(segments):
                        angle=2*math.pi*col/segments
                        seam=1.04+.09*(1 if col%8<4 else -1)
                        z=seam+(1.88-seam)*t if cap else .18+(seam-.18)*t
                        radius=math.sqrt(max(0,1-((z-1.03)/.85)**2))
                        vertices.append((.60*radius*math.cos(angle)+(.06*t if cap and opening else 0),.53*radius*math.sin(angle),z+(opening if cap else 0)))
                for row in range(rings):
                    for col in range(segments):
                        i=row*segments+col;j=row*segments+(col+1)%segments
                        faces.append((i,j,j+segments,i+segments))
                mesh=bpy.data.meshes.new('EggShellMesh');mesh.from_pydata(vertices,[],faces);mesh.update()
                shell=bpy.data.objects.new('EggCap' if cap else 'EggBase',mesh);scene.collection.objects.link(shell);shell.data.materials.append(cream)
                for poly in shell.data.polygons:poly.use_smooth=True
                solid=shell.modifiers.new('ShellThickness','SOLIDIFY');solid.thickness=.025
            crack=material('crack',(.24,.39,.49))
            for x,z in [(-.23,1.54),(.15,.76)]:
                points=[]
                for step in range(5):
                    px=x+(.04 if step%2 else -.04);pz=z-step*.085
                    py=-.53*math.sqrt(max(.01,1-(px/.6)**2-((pz-1.03)/.85)**2))-.008
                    points.append((px,py,pz+(opening if pz>1.15 else 0)))
                line('ShellCrack',points,crack,.012 if mood=='crack' else .020)
            if mood=='hatching':
                ball('SecretGlow',(0,0,1.10),(.42,.37,.12),material('softglow',(1,.89,.44)))
                for x,z in [(-.76,1.45),(.77,1.75)]:
                    ball('HatchSparkle',(x,-.04,z),(.04,.035,.12),gold)
                    ball('HatchSparkle',(x,-.04,z),(.10,.035,.035),gold)
        for x,z in [(-.25,1.3),(.22,.83),(.02,1.66)]:
            ball('EggSpot',(x,-.48,z+(.25 if mood=='hatching' and z>1.15 else .065 if mood=='splitting' and z>1.15 else 0)),(.10,.025,.115),fur)
        return scene
    baby=stage=='baby';grown=stage=='grown'
    bodyz=.80 if baby else .88
    ball('Body',(0,0,bodyz),(.44 if baby else .53,.39,.54 if baby else .63),fur)
    ball('Belly',(0,-.345,bodyz),(.30,.10,.38),cream if kind!='panda' else white)
    headz=1.64 if baby else 1.78
    head=ball('Head',(0,-.035,headz),(.65,.52,.57) if baby else (.59,.48,.54),fur)
    if kind=='capybara':head.scale=(.62,.55,.48)
    for sign in [-1,1]:
        ball('Foot',(sign*.30,-.22,.28),(.23,.29,.16),gold if kind=='penguin' else fur)
        arm=ball('Arm',(sign*.49,-.015,1.02 if mood!='happy' else 1.3),(.16,.19,.32),fur)
        arm.rotation_euler[1]=sign*(-.35 if mood!='happy' else -.95)
    if kind in ['cat','fox']:
        for sign in [-1,1]:
            cone('PointyEar',(sign*.44,.015,headz+.47),(.23,.16,.34),fur)
            cone('InnerEar',(sign*.44,-.13,headz+.46),(.12,.045,.20),pink if kind=='cat' else cream)
        tail=ball('FluffyTail',(.55,.32,.72),(.21,.24,.52),fur);tail.rotation_euler[1]=-.6
        ball('TailTip',(.78,.31,1.03),(.20,.22,.20),cream)
    if kind=='rabbit':
        for sign in [-1,1]:
            ear=ball('LongEar',(sign*.29,.05,headz+.68),(.16,.15,.47),fur);ear.rotation_euler[1]=sign*.14
            inner=ball('InnerEar',(sign*.29,-.085,headz+.70),(.078,.035,.32),pink);inner.rotation_euler[1]=sign*.14
    if kind in ['bear','panda','capybara']:
        for sign in [-1,1]:
            ball('RoundEar',(sign*.46,.04,headz+.4),(.20,.16,.21) if kind!='capybara' else (.13,.13,.14),cream if kind=='panda' else fur)
            if kind=='panda':ball('EyePatch',(sign*.23,-.45,headz+.02),(.18,.09,.23),cream)
        if kind=='capybara':
            ball('OrangeOnHead',(0,0,headz+.56),(.18,.17,.16),material('orange',(1,.31,.035)))
            ball('OrangeLeaf',(.09,0,headz+.70),(.13,.04,.05),mint)
    if kind=='dog':
        for sign in [-1,1]:ball('FloppyEar',(sign*.56,.04,headz+.04),(.20,.22,.43),material('dog_ear',(.27,.13,.065)))
    if kind in ['penguin','owl']:
        for sign in [-1,1]:
            ball('FaceDisk',(sign*.23,-.40,headz+.03),(.29,.12,.35),cream)
            if kind=='owl':cone('FeatherEar',(sign*.45,.03,headz+.40),(.20,.17,.25),fur)
        ball('Beak',(0,-.62,headz-.13),(.13,.19,.10),gold)
    if kind=='turtle':
        ball('Shell',(0,.31,.91),(.66,.36,.70),material('shell',(.13,.35,.21)))
        for sign in [-1,1]:ball('ShellSpot',(sign*.46,.33,1.14),(.19,.15,.24),cream)
    if kind=='dragon':
        for sign in [-1,1]:
            cone('Horn',(sign*.36,.02,headz+.48),(.12,.13,.26),gold)
            wing=ball('Wing',(sign*.65,.32,1.10),(.35,.10,.43),cream);wing.rotation_euler[1]=sign*.5
        for z in [.4,.7,1.0]:cone('BackSpine',(0,.5,z),(.14,.20,.16),gold)
    if kind=='axolotl':
        for sign in [-1,1]:
            for j in range(3):
                gill=ball('FeatheryGill',(sign*(.65+(.08 if j==1 else 0)),.02,headz+(.25-j*.25)),(.28,.11,.09),pink);gill.rotation_euler[1]=sign*(j-1)*.5
    if kind=='lion':
        mane=material('lion_mane',(.47,.18,.065))
        for i in range(12):
            angle=2*math.pi*i/12
            ball('Mane',(math.sin(angle)*.53,.045,headz+math.cos(angle)*.52),(.23,.25,.25),mane)
        for sign in [-1,1]:ball('LionEar',(sign*.42,-.01,headz+.39),(.16,.15,.16),fur)
    if kind=='tiger':
        for sign in [-1,1]:
            ball('TigerEar',(sign*.44,0,headz+.43),(.18,.15,.19),fur)
            for j in range(3):line('TigerStripe',[(sign*.46,-.32,headz+.22-j*.16),(sign*.37,-.44,headz+.18-j*.16)],dark,.036)
        for x in [-.19,0,.19]:line('ForeheadStripe',[(x,-.32,headz+.45),(x*.8,-.43,headz+.30)],dark,.027)
    if kind=='elephant':
        for sign in [-1,1]:
            ball('ElephantEar',(sign*.63,.05,headz+.03),(.31,.16,.42),fur)
            ball('InnerElephantEar',(sign*.66,-.10,headz+.03),(.20,.04,.29),cream)
        line('Trunk',[(0,-.49,headz-.13),(0,-.66,headz-.40),(.08,-.68,headz-.63),(.22,-.64,headz-.59)],fur,.105)
    if kind=='giraffe':
        for sign in [-1,1]:
            ball('GiraffeEar',(sign*.49,.0,headz+.37),(.24,.12,.12),fur)
            ball('Ossicone',(sign*.23,.02,headz+.62),(.06,.07,.19),fur)
            ball('OssiconeTip',(sign*.23,.02,headz+.79),(.095,.08,.08),material('giraffe_spots',(.50,.24,.065)))
        for x,z in [(-.40,1.01),(.40,.76),(-.18,headz+.31),(.23,headz+.32)]:ball('GiraffeSpot',(x,-.40,z),(.075,.027,.07),material('giraffe_spots',(.50,.24,.065)))
    if kind=='zebra':
        for sign in [-1,1]:
            ball('ZebraEar',(sign*.33,.04,headz+.54),(.12,.12,.26),fur)
            for j in range(3):line('ZebraStripe',[(sign*.51,-.23,headz+.28-j*.17),(sign*.36,-.43,headz+.23-j*.17)],cream,.035)
        for z in [headz+.42,headz+.31]:line('ZebraForehead',[(-.14,-.36,z),(0,-.45,z-.05),(.14,-.36,z)],cream,.026)
        ball('ZebraMuzzle',(0,-.51,headz-.21),(.25,.13,.15),cream)
    if kind=='monkey':
        for sign in [-1,1]:
            ball('MonkeyEar',(sign*.61,.04,headz+.01),(.22,.18,.25),fur)
            ball('MonkeyInnerEar',(sign*.62,-.12,headz+.01),(.14,.04,.16),cream)
            ball('MonkeyFace',(sign*.20,-.42,headz+.015),(.27,.11,.31),cream)
        line('CurlyTail',[(.2,.37,.40),(.7,.34,.58),(.90,.29,1.05),(.73,.25,1.15),(.64,.24,.95)],fur,.075)
    if kind=='koala':
        for sign in [-1,1]:
            ball('KoalaEar',(sign*.59,.0,headz+.23),(.29,.23,.30),fur)
            ball('KoalaInnerEar',(sign*.61,-.19,headz+.23),(.19,.04,.21),cream)
        ball('KoalaNose',(0,-.55,headz-.12),(.11,.09,.17),dark)
    if kind in ['redpanda','raccoon']:
        for sign in [-1,1]:
            ball('MaskEar',(sign*.45,.02,headz+.40),(.19,.16,.21),cream)
            ball('EyeMask',(sign*.23,-.46,headz+.01),(.23,.075,.18),dark if kind=='raccoon' else cream)
            ball('WhiteBrow',(sign*.23,-.43,headz+.24),(.13,.05,.045),cream)
        tail=ball('RingTail',(.56,.33,.71),(.21,.20,.58),fur);tail.rotation_euler[1]=-.45
        for i in range(4):ball('TailRing',(.42+i*.085,.29,.40+i*.17),(.20,.205,.065),cream if kind=='redpanda' else dark)
    if kind=='otter':
        for sign in [-1,1]:
            ball('OtterEar',(sign*.47,.07,headz+.30),(.13,.13,.14),fur)
            line('Whisker',[(sign*.17,-.59,headz-.19),(sign*.36,-.55,headz-.23)],dark,.012)
        tail=ball('OtterTail',(.39,.31,.40),(.17,.17,.41),fur);tail.rotation_euler[1]=-.8
    if kind=='hedgehog':
        spines=material('spines',(.34,.18,.09))
        for i in range(11):
            angle=math.pi*(i/10-.5)
            spine=cone('HedgehogSpine',(math.sin(angle)*.57,.18,headz+math.cos(angle)*.48),(.12,.16,.23),spines);spine.rotation_euler[1]=angle
        for sign in [-1,1]:ball('HedgehogEar',(sign*.43,-.03,headz+.25),(.13,.10,.16),cream)
    if kind=='squirrel':
        for sign in [-1,1]:
            cone('SquirrelEar',(sign*.37,.04,headz+.49),(.14,.12,.25),fur)
        tail=ball('SquirrelPlume',(.58,.40,1.02),(.38,.27,.72),fur);tail.rotation_euler[1]=-.26
        ball('TailCream',(.75,.20,1.17),(.20,.065,.38),cream)
    if kind=='sheep':
        for i in range(9):
            angle=math.pi*i/8
            ball('Wool',(.52*math.cos(angle),-.06,headz+.39*math.sin(angle)),(.21,.19,.22),cream)
        for sign in [-1,1]:ball('SheepEar',(sign*.54,.02,headz-.04),(.24,.13,.12),fur)
        for x,z in [(-.35,.7),(.35,.7),(-.3,1.08),(.3,1.08)]:ball('BodyWool',(x,.01,z),(.23,.33,.24),cream)
    if kind=='pig':
        for sign in [-1,1]:
            ear=cone('PigEar',(sign*.40,.02,headz+.43),(.23,.14,.22),fur);ear.rotation_euler[1]=sign*.35
        ball('PigSnout',(0,-.55,headz-.17),(.23,.11,.14),pink)
        for sign in [-1,1]:ball('Nostril',(sign*.08,-.654,headz-.16),(.028,.018,.048),material('snout',(.56,.18,.28)))
    if kind=='frog':
        for sign in [-1,1]:ball('FrogEyeBulge',(sign*.29,-.22,headz+.43),(.23,.23,.23),fur)
        line('FrogSmile',[(-.27,-.50,headz-.18),(0,-.57,headz-.29),(.27,-.50,headz-.18)],dark,.025)
    if kind=='seal':
        for sign in [-1,1]:
            flipper=ball('SealFlipper',(sign*.57,0,.67),(.17,.18,.40),fur);flipper.rotation_euler[1]=sign*.8
            line('SealWhisker',[(sign*.12,-.56,headz-.17),(sign*.32,-.57,headz-.23)],dark,.013)
            ball('SealTail',(sign*.16,.36,.23),(.24,.31,.10),fur)
    if kind=='deer':
        for sign in [-1,1]:
            ball('DeerEar',(sign*.47,.0,headz+.34),(.23,.12,.12),fur)
            line('Antler',[(sign*.28,.07,headz+.39),(sign*.33,.08,headz+.66),(sign*.43,.08,headz+.82)],cream,.047)
            line('AntlerBranch',[(sign*.33,.08,headz+.61),(sign*.19,.06,headz+.76)],cream,.033)
        for sign in [-1,1]:ball('DeerSpot',(sign*.42,-.25,headz-.09),(.055,.025,.07),cream)
    if kind=='unicorn':
        cone('UnicornHorn',(0,-.10,headz+.61),(.115,.115,.37),gold)
        for sign in [-1,1]:cone('UnicornEar',(sign*.35,.04,headz+.44),(.13,.13,.22),fur)
        for i in range(5):ball('RainbowMane',(-.25+i*.10,.07,headz+.45),(.12,.14,.15),material('mane'+str(i),[(.97,.48,.67),(.67,.55,.95),(.34,.77,.86),(.46,.84,.65),(.98,.76,.31)][i]))
        tail=ball('UnicornTail',(.54,.30,.61),(.20,.20,.43),pink);tail.rotation_euler[1]=-.6
    for sign in [-1,1]:
        x=sign*.235;y=-.525 if baby else -.49
        if kind in ['penguin','owl']:y=-.535
        if kind in ['monkey','redpanda','raccoon']:y=-.565
        eyez=headz+(.44 if kind=='frog' else 0)
        if kind=='frog':x=sign*.29;y=-.45
        if mood=='sleepy':line('ClosedEye',[(x-.085,y,eyez+.045),(x,y-.014,eyez+.015),(x+.085,y,eyez+.045)],dark,.024)
        elif mood=='happy':line('HappyEye',[(x-.075,y,eyez+.015),(x,y-.014,eyez+.08),(x+.075,y,eyez+.015)],dark,.03)
        else:
            ball('Eye',(x,y,eyez+.055),(.055,.042,.076),dark);ball('EyeGlint',(x-.014,y-.036,eyez+.083),(.019,.015,.024),white)
        if kind not in ['panda','owl']:ball('Cheek',(sign*.37,y+.04,headz-.12),(.09,.025,.045),pink)
    if kind not in ['penguin','owl','elephant','koala','pig','frog']:
        if kind in ['dog','bear','capybara','fox','lion','tiger','otter','deer','squirrel','hedgehog']:ball('Muzzle',(0,-.48,headz-.18),(.24,.16,.16),cream)
        ball('Nose',(0,-.635 if kind in ['dog','bear','capybara','fox','lion','tiger','otter','deer','squirrel','hedgehog'] else -.56,headz-.13),(.055,.04,.04),dark)
        line('Smile',[(-.09,-.555,headz-.22),(0,-.58,headz-.27),(.09,-.555,headz-.22)],dark,.018)
    if not baby:
        bpy.ops.mesh.primitive_torus_add(major_radius=.37,minor_radius=.07,major_segments=32,minor_segments=12,location=(0,0,1.34));bpy.context.object.name='Scarf';bpy.context.object.data.materials.append(mint)
        scarf=ball('ScarfTail',(.24,-.35,1.10),(.10,.055,.25),mint);scarf.rotation_euler[1]=-.24
    if grown:
        ball('AchievementMedal',(0,-.46,.91),(.15,.06,.15),gold)
        ball('MedalGem',(0,-.515,.93),(.065,.025,.075),white)
        for sign in [-1,1]:ball('ShoulderStar',(sign*.49,-.15,1.10),(.07,.045,.07),gold)
    if mood=='happy':
        for x,z in [(-.9,1.8),(.85,2.2)]:
            ball('SparkleVertical',(x,-.05,z),(.04,.035,.14),gold);ball('SparkleHorizontal',(x,-.05,z),(.11,.035,.04),gold)
    if mood=='sleepy':
        for x,z,r in [(.68,2.20,.09),(.85,2.43,.06)]:ball('DreamBubble',(x,.0,z),(r,r,r),material('dream',(.65,.78,1)))
    return scene

# The MCP client appends a scoped render call; original default scene is preserved.
