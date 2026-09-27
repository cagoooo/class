"""Species-specific region palettes: body, belly, paws, and bright appendages."""
REGION_COLORS = {
 'cat':((.95,.29,.055),(1,.82,.40),(.32,.10,.055),(.08,.58,.52)),
 'dog':((.43,.15,.055),(1,.65,.24),(.13,.045,.022),(.06,.46,.64)),
 'rabbit':((.55,.25,.82),(1,.79,.90),(.24,.07,.46),(.98,.25,.43)),
 'panda':((.92,.96,1),(1,.89,.64),(.028,.065,.105),(.15,.64,.33)),
 'fox':((1,.18,.02),(1,.85,.50),(.16,.052,.025),(.07,.48,.48)),
 'bear':((.63,.27,.075),(1,.77,.30),(.23,.07,.025),(.14,.54,.32)),
 'penguin':((.035,.20,.38),(1,.91,.65),(.96,.37,.03),(.06,.61,.70)),
 'owl':((.32,.12,.58),(1,.75,.32),(.88,.30,.055),(.10,.57,.63)),
 'turtle':((.10,.50,.24),(.80,.93,.19),(.025,.23,.18),(.035,.32,.43)),
 'dragon':((.025,.48,.52),(1,.69,.16),(.07,.19,.35),(.50,.14,.70)),
 'capybara':((.59,.30,.10),(1,.72,.34),(.25,.10,.04),(.13,.52,.29)),
 'axolotl':((1,.39,.49),(1,.84,.59),(.58,.08,.24),(.61,.17,.76)),
 'lion':((.98,.48,.055),(1,.82,.36),(.41,.12,.025),(.66,.12,.025)),
 'tiger':((1,.28,.025),(1,.86,.48),(.28,.065,.022),(.06,.46,.39)),
 'elephant':((.23,.42,.65),(.64,.88,.98),(.075,.19,.34),(.92,.32,.43)),
 'giraffe':((.95,.62,.10),(1,.89,.48),(.40,.14,.035),(.08,.48,.46)),
 'zebra':((.85,.94,1),(.98,.77,.43),(.035,.08,.14),(.13,.47,.66)),
 'monkey':((.42,.16,.035),(1,.67,.24),(.18,.052,.018),(.14,.57,.32)),
 'koala':((.30,.48,.56),(.86,.95,.73),(.10,.25,.32),(.98,.43,.40)),
 'redpanda':((.83,.20,.035),(1,.81,.40),(.19,.055,.027),(.08,.46,.41)),
 'raccoon':((.25,.40,.47),(.88,.96,.74),(.045,.10,.16),(.94,.44,.09)),
 'otter':((.43,.20,.055),(1,.75,.32),(.18,.065,.03),(.05,.52,.58)),
 'hedgehog':((.67,.37,.12),(1,.86,.49),(.25,.08,.025),(.28,.15,.07)),
 'squirrel':((.82,.30,.055),(1,.79,.36),(.32,.08,.025),(.08,.50,.34)),
 'sheep':((.96,.79,.48),(1,.96,.78),(.26,.15,.34),(.57,.22,.64)),
 'pig':((1,.37,.47),(1,.80,.60),(.55,.11,.29),(.16,.54,.59)),
 'frog':((.13,.62,.075),(.98,.91,.22),(.035,.30,.15),(.05,.43,.50)),
 'seal':((.29,.60,.76),(.90,.98,1),(.055,.25,.43),(.22,.36,.72)),
 'deer':((.66,.29,.07),(1,.80,.37),(.25,.075,.025),(.09,.50,.38)),
 'unicorn':((.65,.36,.91),(1,.82,.94),(.33,.12,.59),(.08,.62,.70))
}

def color_pet(scene,kind,stage):
    colors=REGION_COLORS[kind]
    body=material('region_body_'+kind,colors[0])
    belly=material('region_belly_'+kind,colors[1])
    paws=material('region_paws_'+kind,colors[2])
    accent=material('region_accent_'+kind,colors[3])
    ear=material('region_ear_'+kind,(.98,.29,.37) if kind not in ['panda','penguin','owl','frog'] else colors[1])
    for mat in [body,belly,paws,accent]:
        node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Roughness'].default_value=.47
        if not mat.node_tree.nodes.get('RegionGrain'):
            noise=mat.node_tree.nodes.new('ShaderNodeTexNoise');noise.name='RegionGrain';noise.inputs['Scale'].default_value=95
            bump=mat.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.018
            mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs['Normal'],node.inputs['Normal'])
    # Broad color blocking remains legible when the image is reduced to a student card.
    for obj in scene.objects:
        if obj.type not in ['MESH','CURVE'] or not obj.data.materials: continue
        name=obj.name
        if name.startswith(('Body','Head','Arm','EvolutionHaunch','EvolutionLeg')) and not name.startswith('BodyWool'):
            mat=paws if kind=='panda' and name.startswith('Arm') else body
        elif name.startswith(('Belly','Muzzle','ZebraMuzzle','FaceDisk','MonkeyFace','EvolutionRuff')):
            mat=belly
        elif name.startswith(('Foot','ToeDetail','EvolutionShoulder')):
            mat=paws if not name.startswith('ToeDetail') else belly
        elif name.startswith(('InnerEar','EarVelvet','InnerElephantEar','KoalaInnerEar','MonkeyInnerEar')):
            mat=ear
        elif name.startswith(('Wing','EvolutionWing','EvolutionFin','SealFlipper','Shell','EvolutionShell','FeatheryGill','GillFringe')):
            mat=accent if not name.startswith(('WingDetail','GillFringe','ShellSpot')) else belly
        elif name.startswith(('Scarf','ForeheadTuft')):
            mat=accent
        elif name.startswith(('EvolutionTailTip','TailCream')):
            mat=belly
        elif name.startswith(('EvolutionTail','FluffyTail','RingTail','SquirrelPlume','OtterTail')):
            mat=body
        elif name.startswith('Mane') and kind=='lion':
            mat=accent
        else: continue
        obj.data.materials[0]=mat
    # Large contrasting anatomy at maturity preserves the species' base identity.
    scene.view_settings.exposure=-.35
