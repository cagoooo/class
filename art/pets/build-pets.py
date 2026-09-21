"""Original classroom pets, modeled procedurally through Blender MCP (safe mode)."""
import bpy
import math
from mathutils import Vector

PALETTES = {
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
 'axolotl':((0.99,0.62,0.74),(1.0,0.86,0.90))
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
        ball('Egg',(0,0,1.03),(.60,.53,.85),cream)
        for x,z in [(-.25,1.3),(.22,.83),(.02,1.66)]:ball('EggSpot',(x,-.48,z),(.10,.025,.115),fur)
        line('ShellPattern',[(-.49,-.28,1),(-.3,-.48,.92),(-.12,-.53,1.02),(.08,-.53,.91),(.29,-.47,1.02),(.49,-.28,.93)],fur,.026)
        ball('Leaf',(0,.0,1.93),(.08,.13,.14),mint)
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
    elif kind=='rabbit':
        for sign in [-1,1]:
            ear=ball('LongEar',(sign*.29,.05,headz+.68),(.16,.15,.47),fur);ear.rotation_euler[1]=sign*.14
            inner=ball('InnerEar',(sign*.29,-.085,headz+.70),(.078,.035,.32),pink);inner.rotation_euler[1]=sign*.14
    elif kind in ['bear','panda','capybara']:
        for sign in [-1,1]:
            ball('RoundEar',(sign*.46,.04,headz+.4),(.20,.16,.21) if kind!='capybara' else (.13,.13,.14),cream if kind=='panda' else fur)
            if kind=='panda':ball('EyePatch',(sign*.23,-.45,headz+.02),(.18,.09,.23),cream)
        if kind=='capybara':
            ball('OrangeOnHead',(0,0,headz+.56),(.18,.17,.16),material('orange',(1,.31,.035)))
            ball('OrangeLeaf',(.09,0,headz+.70),(.13,.04,.05),mint)
    elif kind=='dog':
        for sign in [-1,1]:ball('FloppyEar',(sign*.56,.04,headz+.04),(.20,.22,.43),material('dog_ear',(.27,.13,.065)))
    elif kind in ['penguin','owl']:
        for sign in [-1,1]:
            ball('FaceDisk',(sign*.23,-.40,headz+.03),(.29,.12,.35),cream)
            if kind=='owl':cone('FeatherEar',(sign*.45,.03,headz+.40),(.20,.17,.25),fur)
        ball('Beak',(0,-.62,headz-.13),(.13,.19,.10),gold)
    elif kind=='turtle':
        ball('Shell',(0,.31,.91),(.66,.36,.70),material('shell',(.13,.35,.21)))
        for sign in [-1,1]:ball('ShellSpot',(sign*.46,.33,1.14),(.19,.15,.24),cream)
    elif kind=='dragon':
        for sign in [-1,1]:
            cone('Horn',(sign*.36,.02,headz+.48),(.12,.13,.26),gold)
            wing=ball('Wing',(sign*.65,.32,1.10),(.35,.10,.43),cream);wing.rotation_euler[1]=sign*.5
        for z in [.4,.7,1.0]:cone('BackSpine',(0,.5,z),(.14,.20,.16),gold)
    elif kind=='axolotl':
        for sign in [-1,1]:
            for j in range(3):
                gill=ball('FeatheryGill',(sign*(.65+(.08 if j==1 else 0)),.02,headz+(.25-j*.25)),(.28,.11,.09),pink);gill.rotation_euler[1]=sign*(j-1)*.5
    for sign in [-1,1]:
        x=sign*.235;y=-.525 if baby else -.49
        if kind in ['penguin','owl']:y=-.535
        if mood=='sleepy':line('ClosedEye',[(x-.085,y,headz+.045),(x,y-.014,headz+.015),(x+.085,y,headz+.045)],dark,.024)
        elif mood=='happy':line('HappyEye',[(x-.075,y,headz+.015),(x,y-.014,headz+.08),(x+.075,y,headz+.015)],dark,.03)
        else:
            ball('Eye',(x,y,headz+.055),(.055,.042,.076),dark);ball('EyeGlint',(x-.014,y-.036,headz+.083),(.019,.015,.024),white)
        if kind not in ['panda','owl']:ball('Cheek',(sign*.37,y+.04,headz-.12),(.09,.025,.045),pink)
    if kind not in ['penguin','owl']:
        if kind in ['dog','bear','capybara','fox']:ball('Muzzle',(0,-.48,headz-.18),(.24,.16,.16),cream)
        ball('Nose',(0,-.635 if kind in ['dog','bear','capybara','fox'] else -.56,headz-.13),(.055,.04,.04),dark)
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
