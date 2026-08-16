import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import skillData from '../data/skills.json'

const STORAGE_KEY = 'maplestory-world-board-v01'
const HISTORY_LIMIT = 100

function SkillNode({ data, selected }) {
  const skill = data.skill
  return (
    <div className={`skill-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="skill-node__type">{skill.type ?? 'skill'}</div>
      <div className="skill-node__name">{skill.name}</div>
      <div className="skill-node__stats">
        {skill.damage != null && <span>DMG {skill.damage}%</span>}
        {skill.maxTargets != null && <span>Targets {skill.maxTargets}</span>}
        {skill.cleaveEfficiency != null && <span>Cleave {skill.cleaveEfficiency}%</span>}
        {skill.value != null && <span>Value {skill.value}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { skill: SkillNode }

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board))
}

function makeInitialState() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return buildFromSourceJson()
}

function buildFromSourceJson() {
  return {
    nodes: skillData.skills.map((skill) => ({
      id: skill.id,
      type: 'skill',
      position: skill.position ?? { x: 0, y: 0 },
      data: { skill: { ...skill } },
    })),
    edges: skillData.edges.map((edge) => ({ ...edge })),
  }
}

export default function App() {
  const initial = useMemo(() => makeInitialState(), [])
  const [nodes, setNodes] = useNodesState(initial.nodes)
  const [edges, setEdges] = useEdgesState(initial.edges)
  const [selectedId, setSelectedId] = useState(null)
  const [, setHistoryTick] = useState(0)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const pastRef = useRef([])
  const futureRef = useRef([])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null
  const canUndo = pastRef.current.length > 0
  const canRedo = futureRef.current.length > 0

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }))
  }, [nodes, edges])

  const getCurrentSnapshot = useCallback(() => {
    return cloneBoard({ nodes: nodesRef.current, edges: edgesRef.current })
  }, [])

  const remember = useCallback(() => {
    pastRef.current.push(getCurrentSnapshot())
    if (pastRef.current.length > HISTORY_LIMIT) {
      pastRef.current.shift()
    }
    futureRef.current = []
    setHistoryTick((value) => value + 1)
  }, [getCurrentSnapshot])

  const restoreSnapshot = useCallback(
    (snapshot) => {
      const fresh = cloneBoard(snapshot)
      setNodes(fresh.nodes)
      setEdges(fresh.edges)
      nodesRef.current = fresh.nodes
      edgesRef.current = fresh.edges
      setSelectedId((current) =>
        current && fresh.nodes.some((node) => node.id === current) ? current : null,
      )
    },
    [setEdges, setNodes],
  )

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return

    const previous = pastRef.current.pop()
    futureRef.current.push(getCurrentSnapshot())
    restoreSnapshot(previous)
    setHistoryTick((value) => value + 1)
  }, [getCurrentSnapshot, restoreSnapshot])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return

    const next = futureRef.current.pop()
    pastRef.current.push(getCurrentSnapshot())
    restoreSnapshot(next)
    setHistoryTick((value) => value + 1)
  }, [getCurrentSnapshot, restoreSnapshot])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return

      const key = event.key.toLowerCase()

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  const handleNodesChange = useCallback(
    (changes) => {
      if (changes.some((change) => change.type === 'remove')) {
        remember()
      }

      setNodes((current) => applyNodeChanges(changes, current))
    },
    [remember, setNodes],
  )

  const handleEdgesChange = useCallback(
    (changes) => {
      if (changes.some((change) => change.type === 'remove')) {
        remember()
      }

      setEdges((current) => applyEdgeChanges(changes, current))
    },
    [remember, setEdges],
  )

  const onConnect = useCallback(
    (connection) => {
      remember()
      setEdges((current) => addEdge(connection, current))
    },
    [remember, setEdges],
  )

  const updateSkill = (field, value) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedId
          ? {
              ...node,
              data: {
                ...node.data,
                skill: { ...node.data.skill, [field]: value },
              },
            }
          : node,
      ),
    )
  }

  const addSkill = () => {
    remember()
    const stamp = Date.now()
    const id = `skill_${stamp}`
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'skill',
        position: { x: 340 + (current.length % 4) * 220, y: 180 + current.length * 35 },
        data: {
          skill: {
            id,
            name: 'New Skill',
            type: 'upgrade',
            damage: 100,
            maxTargets: 1,
          },
        },
      },
    ])
    setSelectedId(id)
  }

  const deleteSelected = () => {
    if (!selectedId) return
    remember()
    setNodes((current) => current.filter((node) => node.id !== selectedId))
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId))
    setSelectedId(null)
  }

  const resetFromJson = () => {
    remember()
    const fresh = buildFromSourceJson()
    setNodes(fresh.nodes)
    setEdges(fresh.edges)
    setSelectedId(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const exportJson = () => {
    const payload = {
      version: '0.1',
      skills: nodes.map((node) => ({
        ...node.data.skill,
        id: node.id,
        position: node.position,
      })),
      edges: edges.map(({ id, source, target }) => ({ id, source, target })),
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'skills.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>MapleStory World Board</strong>
          <span className="version">V0.1</span>
        </div>
        <div className="topbar__actions">
          <button className="ghost" onClick={undo} disabled={!canUndo}>Undo</button>
          <button className="ghost" onClick={redo} disabled={!canRedo}>Redo</button>
          <button onClick={addSkill}>+ Add Skill</button>
          <button onClick={exportJson}>Export JSON</button>
          <button className="ghost" onClick={resetFromJson}>Reset from GitHub JSON</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <h3>Boards</h3>
          <button className="board-button active">Skills</button>
          <button className="board-button" disabled>World</button>
          <button className="board-button" disabled>Monsters</button>
          <button className="board-button" disabled>Bosses</button>
          <button className="board-button" disabled>Items</button>
          <p className="hint">노드를 드래그하고 아래/위 점을 이어 연결할 수 있습니다.</p>
          <p className="hint">Ctrl+Z 실행 취소 · Ctrl+Y / Ctrl+Shift+Z 다시 실행</p>
        </aside>

        <section className="flow-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={remember}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.25}
            maxZoom={2}
          >
            <Background gap={22} size={1} />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </section>

        <aside className="properties">
          <h3>Properties</h3>
          {!selectedNode && <p className="empty">노드를 선택하면 여기서 수치를 수정할 수 있습니다.</p>}
          {selectedNode && (
            <div className="property-form">
              <label>
                Name
                <input
                  value={selectedNode.data.skill.name ?? ''}
                  onFocus={remember}
                  onChange={(e) => updateSkill('name', e.target.value)}
                />
              </label>
              <label>
                Type
                <select
                  value={selectedNode.data.skill.type ?? 'upgrade'}
                  onFocus={remember}
                  onChange={(e) => updateSkill('type', e.target.value)}
                >
                  <option value="attack">Attack</option>
                  <option value="upgrade">Upgrade</option>
                  <option value="buff">Buff</option>
                  <option value="utility">Utility</option>
                </select>
              </label>
              <NumberField label="Damage %" value={selectedNode.data.skill.damage} onFocus={remember} onChange={(v) => updateSkill('damage', v)} />
              <NumberField label="Max Targets" value={selectedNode.data.skill.maxTargets} onFocus={remember} onChange={(v) => updateSkill('maxTargets', v)} />
              <NumberField label="Cleave %" value={selectedNode.data.skill.cleaveEfficiency} onFocus={remember} onChange={(v) => updateSkill('cleaveEfficiency', v)} />
              <NumberField label="Value" value={selectedNode.data.skill.value} onFocus={remember} onChange={(v) => updateSkill('value', v)} />
              <NumberField label="Threshold %" value={selectedNode.data.skill.threshold} onFocus={remember} onChange={(v) => updateSkill('threshold', v)} />
              <button className="danger" onClick={deleteSelected}>Delete Node</button>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

function NumberField({ label, value, onChange, onFocus }) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value ?? ''}
        placeholder="—"
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}
