import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import skillData from '../data/skills.json'

const STORAGE_KEY = 'maplestory-world-board-v01'

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

function makeInitialState() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

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
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selectedId, setSelectedId] = useState(null)

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }))
  }, [nodes, edges])

  const onConnect = useCallback(
    (connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
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
    setNodes((current) => current.filter((node) => node.id !== selectedId))
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId))
    setSelectedId(null)
  }

  const resetFromJson = () => {
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
        </aside>

        <section className="flow-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
                  onChange={(e) => updateSkill('name', e.target.value)}
                />
              </label>
              <label>
                Type
                <select
                  value={selectedNode.data.skill.type ?? 'upgrade'}
                  onChange={(e) => updateSkill('type', e.target.value)}
                >
                  <option value="attack">Attack</option>
                  <option value="upgrade">Upgrade</option>
                  <option value="buff">Buff</option>
                  <option value="utility">Utility</option>
                </select>
              </label>
              <NumberField label="Damage %" value={selectedNode.data.skill.damage} onChange={(v) => updateSkill('damage', v)} />
              <NumberField label="Max Targets" value={selectedNode.data.skill.maxTargets} onChange={(v) => updateSkill('maxTargets', v)} />
              <NumberField label="Cleave %" value={selectedNode.data.skill.cleaveEfficiency} onChange={(v) => updateSkill('cleaveEfficiency', v)} />
              <NumberField label="Value" value={selectedNode.data.skill.value} onChange={(v) => updateSkill('value', v)} />
              <NumberField label="Threshold %" value={selectedNode.data.skill.threshold} onChange={(v) => updateSkill('threshold', v)} />
              <button className="danger" onClick={deleteSelected}>Delete Node</button>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

function NumberField({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}
