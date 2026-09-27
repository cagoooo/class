"""Three unmistakable silhouettes, composed before the existing reaction pose."""
def evolve_pet(scene, kind, stage, headz, fur, light, gold):
    tier = ['baby','junior','grown'].index(stage)
    # Same framing keeps actual growth visible instead of zooming each age to fill the card.
    scene.camera.data.ortho_scale = 4.35
    scene.camera.rotation_euler = (Vector((0,0,1.65))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    target_head = [1.30,1.94,2.52][tier]
    head_scale = [.96,1.0,.94][tier]
    body_width = [.76,1.04,1.32][tier]
    body_height = [.74,1.13,1.62][tier]
    # Mature species gain anatomy, not merely a different badge.
    if tier == 2:
        if kind in ['cat','fox','redpanda','raccoon','squirrel']:
            for sign in [-1,1]:
                tail=ball('EvolutionTail',(sign*.72,.35,.83),(.26,.25,.72),fur)
                tail.rotation_euler[1]=sign*.62
                ball('EvolutionTailTip',(sign*1.05,.29,1.26),(.22,.23,.26),light)
        if kind in ['dragon','owl','penguin','unicorn']:
            for sign in [-1,1]:
                for j in range(4):
                    wing=ball('EvolutionWing',(sign*(.64+j*.13),.25,1.32+j*.09),(.13,.085,.48-j*.045),light)
                    wing.rotation_euler[1]=sign*(.75+j*.14)
        if kind in ['lion','tiger','dog','bear','koala']:
            for j in range(9):
                angle=math.pi*(j/8+.05)
                ball('EvolutionRuff',(.67*math.cos(angle),.06,headz-.22+.33*math.sin(angle)),(.18,.23,.23),light)
        if kind in ['panda','capybara','elephant','pig','monkey']:
            for sign in [-1,1]:
                ball('EvolutionHaunch',(sign*.43,.08,.53),(.31,.30,.35),fur)
                ball('EvolutionShoulder',(sign*.47,.04,1.13),(.23,.26,.24),light)
        if kind in ['rabbit','giraffe','zebra','deer']:
            for sign in [-1,1]:
                ball('EvolutionLeg',(sign*.31,-.10,.49),(.17,.23,.34),fur)
        if kind in ['axolotl','otter','frog','seal']:
            for sign in [-1,1]:
                fin=ball('EvolutionFin',(sign*.61,.17,.72),(.29,.10,.42),light)
                fin.rotation_euler[1]=sign*.72
        if kind=='turtle':
            for j in range(5):
                cone('EvolutionShellCrest',(0,.55,.48+j*.21),(.20,.26,.19),gold)
        if kind=='hedgehog':
            for sign in [-1,1]:
                for j in range(4):
                    spine=cone('EvolutionSpine',(sign*(.56+j*.045),.2,.55+j*.22),(.16,.20,.30),light)
                    spine.rotation_euler[1]=sign*.85
        if kind=='sheep':
            for sign in [-1,1]:
                line('EvolutionRamHorn',[(sign*.40,.0,headz+.30),(sign*.72,-.02,headz+.40),(sign*.83,-.09,headz+.13),(sign*.63,-.19,headz+.05)],gold,.09)
        if kind=='deer':
            for sign in [-1,1]:
                for j in range(3):
                    line('EvolutionAntler',[(sign*.33,.08,headz+.55),(sign*(.55+j*.10),.08,headz+.75+j*.09),(sign*(.60+j*.12),.08,headz+.96+j*.06)],light,.035)
    # Morph every face part together so eyes and brows never float away from the head.
    body_prefix=('Arm','Wing','Scarf','Shoulder','EvolutionWing','EvolutionFin','EvolutionTail','EvolutionShoulder','EvolutionHaunch','EvolutionLeg','EvolutionShell','EvolutionSpine','Sparkle','Dream','WaveTrail','GreetingPaw')
    for obj in list(scene.objects):
        if obj.type not in ['MESH','CURVE'] or obj.name.startswith('Pedestal'): continue
        curve_points = [p for spline in obj.data.splines for p in spline.bezier_points] if obj.type=='CURVE' else []
        face = not obj.name.startswith(body_prefix) and (obj.location.z>headz-.36 or (curve_points and min(p.co.z for p in curve_points)>headz-.36))
        sx = head_scale if face else body_width
        sz = head_scale if face else body_height
        anchor = headz if face else .20
        dest = target_head if face else .20
        if curve_points:
            for p in curve_points:
                for v in [p.co,p.handle_left,p.handle_right]:
                    v.x*=sx;v.y*=sx;v.z=dest+(v.z-anchor)*sz
            obj.data.bevel_depth*=sx
        else:
            obj.location.x*=sx;obj.location.y*=sx;obj.location.z=dest+(obj.location.z-anchor)*sz
            obj.scale.x*=sx;obj.scale.y*=sx;obj.scale.z*=sz
        # Appendage growth changes the outline from little buds to pronounced species traits.
        if obj.type=='MESH' and obj.name.startswith(('LongEar','InnerEar','Horn','UnicornHorn','FeatheryGill','GillFringe','Mane','HedgehogSpine','SquirrelPlume','Shell','FluffyTail','RingTail','TailRing','ElephantEar','InnerElephantEar')):
            factor=[.62,1.0,1.28][tier]
            obj.scale*=factor
        if obj.name.startswith(('Antler','EvolutionAntler')) and tier==0: obj.hide_render=True
    return target_head
