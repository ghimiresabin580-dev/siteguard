// The vocabulary of the site: hazards, observation types, permits, PPE, roles.

export const HAZARDS = [
  { key: 'access', label: 'Access and egress', icon: 'door-open' },
  { key: 'traffic', label: 'Site traffic', icon: 'traffic-cone' },
  { key: 'plant', label: 'Mobile plant', icon: 'tractor' },
  { key: 'lifting', label: 'Lifting operations', icon: 'anchor' },
  { key: 'height', label: 'Working at height', icon: 'arrow-up-to-line' },
  { key: 'excavation', label: 'Excavations', icon: 'shovel' },
  { key: 'services', label: 'Buried services', icon: 'cable' },
  { key: 'hotwork', label: 'Hot works', icon: 'flame' },
  { key: 'electrical', label: 'Electrical', icon: 'zap' },
  { key: 'manual', label: 'Manual handling', icon: 'package' },
  { key: 'noise', label: 'Noise and vibration', icon: 'ear' },
  { key: 'dust', label: 'Dust and silica', icon: 'cloud-fog' },
  { key: 'ice', label: 'Ice and slippery ground', icon: 'snowflake' },
  { key: 'light', label: 'Low daylight', icon: 'flashlight' },
  { key: 'housekeeping', label: 'Housekeeping and storage', icon: 'warehouse' },
  { key: 'environment', label: 'Environment and water', icon: 'leaf' },
  { key: 'public', label: 'Public interface', icon: 'users-round' },
  { key: 'wellbeing', label: 'Fatigue and wellbeing', icon: 'brain' }
];
export const hazard = key => HAZARDS.find(h => h.key === key) || { key, label: key, icon: 'triangle-exclamation-point' };

export const OBS_TYPES = [
  { key: 'hazard', label: 'Hazard', icon: 'triangle-exclamation-point' },
  { key: 'near-miss', label: 'Near miss', icon: 'octagon-exclamation-point' },
  { key: 'unsafe-act', label: 'Unsafe act', icon: 'user-x' },
  { key: 'housekeeping', label: 'Housekeeping', icon: 'recycle' },
  { key: 'good', label: 'Good practice', icon: 'thumbs-up' }
];
export const obsType = key => OBS_TYPES.find(t => t.key === key) || OBS_TYPES[0];

export const SEVERITY = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'warn' },
  high: { label: 'High', tone: 'danger' }
};
export const OBS_STATUS = {
  open: { label: 'Open', tone: 'danger-soft' },
  progress: { label: 'In progress', tone: 'warn-soft' },
  closed: { label: 'Closed', tone: 'ok-soft' }
};

export const PERMIT_TYPES = {
  hotwork: {
    label: 'Hot work', icon: 'flame',
    checklist: [
      'Combustible material removed or covered within 10 m',
      'At least two suitable fire extinguishers at the work point',
      'Every worker holds a valid hot work card (tulityökortti)',
      'Fire watch named and staying at least 60 minutes after the work ends',
      'Smoke detectors in the area isolated with the fire alarm company'
    ]
  },
  excavation: {
    label: 'Excavation', icon: 'shovel',
    checklist: [
      'Buried services located and marked on the ground',
      'Shoring or a safe slope in place before anyone enters',
      'Barriers or edge protection around the excavation',
      'Ladder or ramp for access and egress',
      'Spoil heaps and loads kept at least 1 m from the edge'
    ]
  },
  height: {
    label: 'Working at height', icon: 'arrow-up-to-line',
    checklist: [
      'Guardrails or edge protection in place',
      'Harness and anchor points checked where guardrails are not possible',
      'MEWP or scaffold inspected and tagged',
      'Rescue plan agreed with the crew',
      'Area below barriered off'
    ]
  },
  confined: {
    label: 'Confined space', icon: 'box',
    checklist: [
      'Gas test done and recorded before entry',
      'Standby person at the entrance for the whole job',
      'Forced ventilation running',
      'Rescue equipment and rescue plan in place'
    ]
  },
  lifting: {
    label: 'Lifting', icon: 'anchor',
    checklist: [
      'Lift plan approved by the appointed person',
      'Wind below the crane limit',
      'Exclusion zone set out and controlled',
      'Signaller named and in radio contact with the operator',
      'Lifting accessories inspected'
    ]
  },
  electrical: {
    label: 'Electrical isolation', icon: 'zap',
    checklist: [
      'Circuit isolated, locked and tagged',
      'Proven dead with a tested voltage detector',
      'Work done by a qualified electrician with an SFS 6002 card',
      'Nearby live parts covered or barriered'
    ]
  }
};
export const PERMIT_STATUS = {
  requested: { label: 'Awaiting approval', tone: 'warn-soft' },
  active: { label: 'Active', tone: 'ok-soft' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger-soft' }
};

export const PPE = [
  { key: 'helmet', label: 'Hard hat with chin strap', icon: 'hard-hat' },
  { key: 'hivis', label: 'Hi-vis clothing', icon: 'shirt' },
  { key: 'boots', label: 'Safety boots', icon: 'footprints' },
  { key: 'gloves', label: 'Gloves', icon: 'hand' },
  { key: 'eyes', label: 'Eye protection', icon: 'glasses' },
  { key: 'hearing', label: 'Hearing protection', icon: 'ear' },
  { key: 'harness', label: 'Harness and lanyard', icon: 'anchor' },
  { key: 'mask', label: 'Respirator (FFP3)', icon: 'wind' }
];

// TR measurement (TR-mittari): the weekly safety walk used on Finnish building sites
export const TR_AREAS = [
  { key: 'work', label: 'Working practices', fi: 'Työskentely' },
  { key: 'scaffold', label: 'Scaffolds and ladders', fi: 'Telineet ja tikkaat' },
  { key: 'machines', label: 'Machines and tools', fi: 'Koneet ja välineet' },
  { key: 'falls', label: 'Fall protection', fi: 'Putoamissuojaus' },
  { key: 'electric', label: 'Electricity and lighting', fi: 'Sähkö ja valaistus' },
  { key: 'order', label: 'Housekeeping and waste', fi: 'Järjestys ja jätehuolto' }
];
export const trIndex = scores => {
  let ok = 0, all = 0;
  for (const a of TR_AREAS) { const s = scores[a.key] || { ok: 0, bad: 0 }; ok += s.ok; all += s.ok + s.bad; }
  return all ? Math.round(1000 * ok / all) / 10 : null;
};

// Things drawn on the site map
export const ITEM_TYPES = ['Zone', 'Gate', 'Fence', 'Walkway', 'Vehicle route', 'Lift area'];
export const CHECK_STATUS = [
  { label: 'Not checked', tone: 'neutral' },
  { label: 'OK', tone: 'ok' },
  { label: 'Problem', tone: 'danger' }
];

export const EQUIPMENT_TYPES = ['Excavator', 'Wheel loader', 'Dump truck', 'Mobile crane', 'Tower crane', 'Telehandler',
  'Forklift', 'MEWP', 'Concrete pump', 'Van or car', 'Other'];

export const DELIVERY_STATUS = {
  booked: { label: 'Booked', tone: 'info-soft' },
  arrived: { label: 'On site', tone: 'warn-soft' },
  unloaded: { label: 'Unloaded', tone: 'ok-soft' },
  cancelled: { label: 'Cancelled', tone: 'neutral' }
};
export const GATES = ['Main gate', 'Side gate'];

export const ACTIVITY_STATUS = {
  planned: { label: 'Planned', tone: 'info-soft' },
  active: { label: 'In progress', tone: 'ok-soft' },
  hold: { label: 'On hold', tone: 'warn-soft' },
  done: { label: 'Done', tone: 'neutral' }
};
