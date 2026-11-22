"""Three unmistakable silhouettes, composed before the existing reaction pose."""
def evolve_pet(scene, kind, stage, headz, fur, light, gold):
    # glory（閃耀，Lv.8 起，v3.71.0）：身形與成熟期完全相同，只加皇冠、底座金環與星光，不再長大。
    tier = ['baby','junior','grown','glory'].index(stage)
    size = min(tier, 2)
    # Same framing keeps actual growth visible instead of zooming each age to fill the card.
    scene.camera.data.ortho_scale = 4.35
    scene.camera.rotation_euler = (Vector((0,0,1.65))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    # v3.70.0（2026-11-22）：長大靠「頭跟著變大、身體適度變大」的 Q 版比例，不再小頭大身體。
    # 舊版成熟期身體寬 1.32、高 1.62、頭反而縮成 .94，加上肩膀／臀部圓球，老師反映看起來太壯、很醜。
    # 頭與身體在脖子處維持約 .28 的重疊（身體頂端 .2+1.31×高；頭底 = 頭位置 − .54×頭比例）。
    target_head = [1.30,1.83,2.17][size]
    head_scale = [.96,1.04,1.12][size]
    body_width = [.76,.92,1.02][size]
    body_height = [.74,1.04,1.26][size]
    # Mature species gain gentle species traits (tail, wings, fins, horns) — never muscle bulges.
    if tier == 3:
        # 皇冠建在原始頭頂座標，名稱不在 body_prefix 內，會跟著五官一起移到放大後的頭上（歪頭時也跟著轉）。
        crown_z = headz + (.50 if kind == 'capybara' else .56)
        gem = material('glory_gem', (.98, .32, .60))
        pearl = material('glory_pearl', (1, .96, .88))  # 小珠固定珍珠白：熊貓、斑馬的淺色是深灰，用物種淺色會變黑點
        bpy.ops.mesh.primitive_torus_add(major_radius=.24, minor_radius=.05, major_segments=40, minor_segments=12, location=(0, -.04, crown_z))
        band = bpy.context.object; band.name = 'GloryCrownBand'; band.data.materials.append(gold)
        for poly in band.data.polygons: poly.use_smooth = True
        for j in range(5):
            a = math.tau * j / 5 + math.pi / 2
            x, y = .24 * math.cos(a), -.04 - .24 * math.sin(a)
            cone('GloryCrownPoint', (x, y, crown_z + .12), (.072, .072, .12), gold)
            ball('GloryCrownJewel', (x, y, crown_z + .255), (.042, .042, .042), pearl)
        ball('GloryCrownGem', (0, -.31, crown_z + .03), (.065, .035, .07), gem)
    if tier >= 2:
        if kind in ['dragon','owl','penguin','unicorn']:
            for sign in [-1,1]:
                for j in range(3):
                    wing=ball('EvolutionWing',(sign*(.58+j*.11),.25,1.30+j*.08),(.11,.07,.36-j*.05),light)
                    wing.rotation_euler[1]=sign*(.75+j*.16)
        if kind=='lion':
            for j in range(9):
                angle=math.pi*(j/8+.05)
                ball('EvolutionRuff',(.60*math.cos(angle),.08,headz-.18+.30*math.sin(angle)),(.14,.17,.17),light)
        if kind in ['axolotl','otter','frog','seal']:
            for sign in [-1,1]:
                fin=ball('EvolutionFin',(sign*.58,.17,.74),(.22,.08,.32),light)
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
            factor=[.62,1.0,1.16][size]
            obj.scale*=factor
        if obj.name.startswith(('Antler','EvolutionAntler')) and tier==0: obj.hide_render=True
    if tier == 3:
        # 星光與底座金環直接放在最後的位置（不參與上面的縮放）。
        for x, z, s in [(-1.0, 2.62, 1.0), (.97, 1.55, .8), (-.95, 1.15, .7), (.99, 2.30, .6)]:
            ball('GloryTwinkleV', (x, -.2, z), (.035 * s, .03, .13 * s), gold)
            ball('GloryTwinkleH', (x, -.2, z), (.11 * s, .03, .035 * s), gold)
        bpy.ops.mesh.primitive_torus_add(major_radius=.83, minor_radius=.03, major_segments=64, minor_segments=12, location=(0, .06, .10))
        ring = bpy.context.object; ring.name = 'PedestalGloryRing'; ring.scale = (1, .82, 1); ring.data.materials.append(gold)
        for poly in ring.data.polygons: poly.use_smooth = True
    return target_head
