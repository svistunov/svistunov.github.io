const canvas = document.getElementById('viewer2')
const engine = new BABYLON.Engine(canvas, true)
let scene = new BABYLON.Scene(engine)
const camera = new BABYLON.ArcRotateCamera(`Camera`, Math.PI / 2, Math.PI / 2, 100, BABYLON.Vector3.Zero(), scene)

let activeItem = ''
let models = []
let buttons = []
const GUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', null, scene)
const uiPanel = new BABYLON.GUI.StackPanel()
const cameraSelector = new BABYLON.GUI.StackPanel()
const puregonData = new BABYLON.GUI.TextBlock()

const cubeTexture = new BABYLON.CubeTexture("assets/environment/studio13/studio13", scene);

scene.environmentTexture = cubeTexture

const puregon = {
  start: 5,
  end: 6.23
}

const puregonDose = {
  start: 0,
  end: 450
}

const puregonEquation = {
  k: (puregonDose.end - puregonDose.start) / (puregon.end - puregon.start),
  b: -puregon.start * (puregonDose.end - puregonDose.start) / (puregon.end - puregon.start)
}

let puregonPosition = puregon.start
const zoom = 1e-1
let closingTimeout = null

const dose = () => Math.abs((puregonEquation.k * puregonPosition + puregonEquation.b).toFixed(0))
const checkBounds = (value) => Math.max(puregon.start, Math.min(puregon.end, value))

camera.lowerRadiusLimit = 100
camera.upperRadiusLimit = 600
camera.attachControl(canvas, true)

puregonData.height = '30px'
puregonData.width = '210px'
uiPanel.width = '210px'
uiPanel.isVertical = true
uiPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT
uiPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP
uiPanel.addControl(cameraSelector)
uiPanel.addControl(puregonData)
GUI.addControl(uiPanel)

function setPuregonPosition (value) {
  puregonPosition = value
  puregonData.text = `Dose: ${dose()}`
}

function setActiveItem (itemTitle) {
  activeItem = itemTitle
  camera.target = models.find(({title}) => title === itemTitle).position
  buttons.find(({title}) => title === itemTitle).button.isChecked = true
}

function addCameraSelector (title) {
  let button = new BABYLON.GUI.RadioButton()
  button.width = '20px'
  button.height = '20px'
  button.color = 'black'
  button.background = 'white'
  button.onIsCheckedChangedObservable.add(function (state) {
    if (state) {
      setActiveItem(title)
    }
  })
  let header = BABYLON.GUI.Control.AddHeader(button, title, '100px', {isHorizontal: true, controlFirst: true})
  header.height = '30px'
  cameraSelector.addControl(header)
  buttons.push({button, title})
}

function loadModel ({scene, root, name, title, cameraScale = 10, position = BABYLON.Vector3.Zero(), active = false, handlers}) {
  addCameraSelector(title)
  BABYLON.SceneLoader.LoadAssetContainer(root, name, scene, function (newScene) {
    try {
      newScene.materials.forEach(mat => {
        if(mat.id === "08_-_Defaultffff") {
          mat.refractionTexture = scene.environmentTexture
          mat.subSurface.isRefractionEnabled = true
          mat.subSurface.intensity = 1
          mat.subSurface.indexOfRefraction = 1.8
        }
      })

      models.push({scene, root, name, title, cameraScale, position})
      const rootNode = new BABYLON.TransformNode()
      newScene.meshes.forEach(mesh => {
        if (!mesh.parent) {
          mesh.parent = rootNode
        }
        mesh.actionManager = new BABYLON.ActionManager(newScene)
        mesh.actionManager.registerAction(
          new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger,
            function (event) {
              camera.target = position
              if (activeItem !== title) {
                setActiveItem(title)
              } else {
                handlers.onMeshClick && handlers.onMeshClick(newScene, mesh)
              }
            })
        )
        if (handlers.onMeshDrag) {
          const dragHandler = handlers.onMeshDrag(mesh)
          if (typeof dragHandler === 'function') {
            const dragBehavior = new BABYLON.PointerDragBehavior({dragAxis: new BABYLON.Vector3(1, 0, 0)})
            dragBehavior.useObjectOrienationForDragging = false
            dragBehavior.moveAttached = false
            dragBehavior.onDragObservable.add((event) => {
              dragHandler(event, newScene)
            })
            mesh.addBehavior(dragBehavior)
          }
        }
      })
      rootNode.position = position
      newScene.animationGroups.forEach(group => group.stop())
      newScene.addAllToScene()
      if (active) {
        setActiveItem(title)
      }
    } catch (e) {
      console.error(e)
      throw Error(e)
    }
  })
}

function animationOnClickHandler (scene, mesh) {
  scene.animationGroups.forEach(group => group.start())
}

function puregonAnimationOnClickHandler (scene, mesh) {
  if (!mesh.id.includes('Cylinder005')) {
    setPuregonPosition(puregon.start)
    animationOnClickHandler(scene, mesh)
  }
}

function puregonDragHandler (mesh) {
  if (mesh.id.includes('Cylinder005')) {
    return (event, scene) => {
      if (!scene.animationGroups[0].isPlaying) {
        const newPosition = checkBounds(puregonPosition - event.dragDistance * zoom)
        const speed = (puregonPosition <= newPosition ? 1 : -1) * 1000
        scene.animationGroups[0].start(false, speed, puregonPosition, newPosition)
        setPuregonPosition(newPosition)
        clearTimeout(closingTimeout)
        closingTimeout = setTimeout(puregonDragEndHandler, 1500, scene)

      }
    }
  }
  return undefined
}

function puregonDragEndHandler (scene) {
  scene.animationGroups[0].start(false, -0.7, puregonPosition, puregon.start)
  setPuregonPosition(puregon.start)
}

function createScene (models) {
  BABYLON.SceneLoader.OnPluginActivatedObservable.add(function (plugin) {
    plugin.animationstartmode = BABYLON.GLTFLoaderAnimationStartMode.NONE
  }, undefined, undefined, undefined, true)
  scene.clearColor = new BABYLON.Color3(1, 1, 1)
  scene.createDefaultLight(true)
  const configurations = [
    {
      scene,
      root: 'model/orgal006/',
      name: 'scene.gltf',
      title: 'orgal',
      handlers: {
        onMeshClick: animationOnClickHandler
      }
    },
    {
      scene,
      root: 'model/puregon_export-005/',
      name: 'scene.gltf',
      title: 'puregon',
      position: new BABYLON.Vector3(400, 0, 0),
      handlers: {
        onMeshClick: puregonAnimationOnClickHandler,
        onMeshDrag: puregonDragHandler
      }
    },
    {
      scene,
      root: 'model/elnova_export05/',
      name: 'scene.gltf',
      title: 'elnova',
      position: new BABYLON.Vector3(-400, 0, 0),
      handlers: {
        onMeshClick: animationOnClickHandler
      }
    }
  ]
  let visibleItems = configurations
  if (models) {
    visibleItems = visibleItems.filter(({title}) => models.includes(title))
    visibleItems.push({...visibleItems.pop(), active: true})
  }
  visibleItems.forEach(loadModel)

  return scene
}

scene = createScene((typeof MODELS !== 'undefined') && MODELS)
window.addEventListener('resize', function () {
  engine.resize()
})

engine.runRenderLoop(function () {
  scene.render()

})
