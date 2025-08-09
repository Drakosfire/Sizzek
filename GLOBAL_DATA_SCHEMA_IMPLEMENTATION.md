# Global Data Schema & Session Integration Implementation Plan
## DungeonMind Cross-Tool Architecture Foundation

**Date**: December 2024  
**Scope**: Global data schema design and CardGenerator integration  
**Priority**: Critical - Foundation for multi-tool vision  
**Timeline**: 4-6 weeks to launch-ready state

---

## 🎯 **Executive Summary**

This document outlines the implementation of a global data schema and session management system that enables DungeonMind's vision of cross-tool object sharing. The plan leverages existing `GlobalSessionManager` infrastructure while establishing patterns for all future tools.

**Key Outcomes**:
- Unified data schema for all DungeonMind objects (items, stores, statblocks, etc.)
- CardGenerator integrated with global session management
- Foundation for cross-tool object sharing and collaboration
- Launch-ready CardGenerator with proper architecture

---

## 🏗️ **Current State Analysis**

### **Existing Infrastructure** ✅
```python
# Already built in DungeonMindServer/session_management.py
class GlobalSession:
    def __init__(self):
        self.ruleslawyer_loader = None
        self.storegenerator_state = None
        self.cardgenerator_state = None  # ← Ready for integration
        self.statblockgenerator_state = None
        self.user_id: Optional[str] = None

class GlobalSessionManager:
    # Session lifecycle management
    # Cross-service state coordination
    # Automatic cleanup and expiration
```

### **Current CardGenerator Issues** ❌
- Uses localStorage for session backup
- No cross-tool object persistence
- Isolated project management
- Redundant state management patterns

### **Firestore Database** ⚠️
- Basic CRUD operations implemented
- No standardized schema for DungeonMind objects
- No cross-tool relationship modeling

---

## 📊 **Global Data Schema Design**

### **Core DungeonMind Object Schema**

```typescript
// Base interface for all DungeonMind creations
interface DungeonMindObject {
  // Identity and ownership
  id: string;                    // UUID
  type: ObjectType;              // 'item' | 'store' | 'statblock' | 'rule' | 'spell'
  createdBy: string;             // User ID
  ownedBy: string;               // Current owner (for transfers)
  
  // Organization and context
  worldId?: string;              // Optional world/campaign grouping
  projectId?: string;            // Optional project grouping
  collectionId?: string;         // Optional collection grouping
  
  // Core metadata (universal across all tools)
  name: string;
  description: string;
  tags: string[];
  category?: string;             // Tool-specific categorization
  
  // Collaboration and sharing
  visibility: 'private' | 'shared' | 'public';
  sharedWith: string[];          // User IDs with access
  permissions: ObjectPermissions; // Read/write/admin permissions
  
  // Content versioning
  version: number;
  versionHistory?: ObjectVersion[];
  isTemplate: boolean;           // Can be used as template by others
  basedOnTemplate?: string;      // Template object ID if derived
  
  // Tool-specific data (exactly one should be present)
  itemData?: ItemCardData;
  storeData?: StoreData;
  statblockData?: StatblockData;
  ruleData?: RuleData;
  spellData?: SpellData;
  
  // System metadata
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  lastAccessedAt?: string;       // For usage analytics
  accessCount: number;           // Popularity tracking
  
  // AI generation metadata
  generationMetadata?: {
    aiModel: string;
    prompt: string;
    generationTime: number;
    tokensUsed: number;
    confidence?: number;
  };
}

enum ObjectType {
  ITEM = 'item',
  STORE = 'store', 
  STATBLOCK = 'statblock',
  RULE = 'rule',
  SPELL = 'spell',
  WORLD = 'world',
  PROJECT = 'project'
}

interface ObjectPermissions {
  canRead: string[];
  canWrite: string[];
  canAdmin: string[];
  isPublicReadable: boolean;
}

interface ObjectVersion {
  version: number;
  timestamp: string;
  changes: string;
  changedBy: string;
  data: any; // Snapshot of object at this version
}
```

### **CardGenerator-Specific Schema**

```typescript
interface ItemCardData {
  // Basic item properties
  itemType: string;              // 'Weapon' | 'Armor' | 'Consumable' | etc.
  rarity: string;                // 'Common' | 'Uncommon' | 'Rare' | etc.
  value: string;                 // "50 gp", "Priceless", etc.
  weight: string;                // "1 lb", "Light", etc.
  
  // Mechanical properties
  properties: string[];          // ["Finesse", "Light", "Versatile"]
  damageFormula?: string;        // "1d8 + 1"
  damageType?: string;           // "Slashing", "Fire", etc.
  armorClass?: string;           // "16 (Chain Mail)"
  requirements?: string;         // "Str 13"
  
  // Flavor and presentation
  quote?: string;                // Flavor text in quotes
  lore?: string;                 // Extended background
  
  // Visual assets
  visualAssets: {
    coreImage?: {
      url: string;
      prompt: string;
      generationMetadata: AIGenerationMetadata;
    };
    borderStyle?: {
      id: string;
      name: string;
      previewUrl: string;
    };
    finalCard?: {
      url: string;
      dimensions: { width: number; height: number; };
      createdAt: string;
    };
    alternativeImages?: Array<{
      url: string;
      prompt: string;
      isSelected: boolean;
    }>;
  };
  
  // Generation workflow state
  generationState: {
    completedSteps: StepId[];
    currentStep: StepId;
    canAdvanceToStep: Record<StepId, boolean>;
    lastSavedStep: StepId;
  };
  
  // System compatibility
  systemData: {
    dnd5e?: DnD5eItemData;
    pathfinder2e?: PF2eItemData;
    generic?: GenericItemData;
  };
}

interface AIGenerationMetadata {
  model: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  generationTime: number;
  tokensUsed: number;
  confidence?: number;
  fallbackUsed?: boolean;
}

type StepId = 'text-generation' | 'core-image' | 'border-generation' | 'final-assembly';
```

### **World and Project Organization Schema**

```typescript
interface DungeonMindWorld {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  
  // World metadata
  setting: string;               // "Forgotten Realms", "Homebrew", etc.
  theme: string;                 // "High Fantasy", "Dark", "Steampunk"
  magicLevel: 'none' | 'low' | 'moderate' | 'high' | 'very_high';
  
  // Collaboration
  members: WorldMember[];
  joinCode?: string;             // For easy joining
  isPublic: boolean;
  
  // Organization
  collections: WorldCollection[];
  defaultPermissions: ObjectPermissions;
  
  createdAt: string;
  updatedAt: string;
}

interface WorldMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  permissions: string[];
}

interface WorldCollection {
  id: string;
  name: string;
  description: string;
  type?: ObjectType;             // Filter by object type
  tags?: string[];               // Auto-include objects with these tags
  objectIds: string[];           // Manually curated objects
  isPublic: boolean;
}

interface DungeonMindProject {
  id: string;
  name: string;
  description: string;
  worldId?: string;              // Optional world association
  createdBy: string;
  
  // Project-specific organization
  objectives: string[];          // "Create magic items for level 5 party"
  deadline?: string;
  status: 'planning' | 'active' | 'completed' | 'archived';
  
  // Content tracking
  objectIds: string[];           // All objects in this project
  templates: string[];           // Template objects for this project
  
  createdAt: string;
  updatedAt: string;
}
```

---

## 🔄 **Global Session Management Integration**

### **Enhanced Global Session Schema**

```python
# DungeonMindServer/session_management.py (Enhanced)
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel

class ToolSessionState(BaseModel):
    """Base class for tool-specific session state"""
    last_updated: datetime
    active_object_id: Optional[str] = None
    session_data: Dict[str, Any] = {}

class CardGeneratorSessionState(ToolSessionState):
    """CardGenerator-specific session state"""
    current_step: str = 'text-generation'
    active_item_id: Optional[str] = None
    draft_item_data: Optional[Dict] = None
    generation_locks: Dict[str, bool] = {}
    step_completion: Dict[str, bool] = {}
    
    # Quick access to recent work
    recent_items: List[str] = []  # Object IDs
    current_project_id: Optional[str] = None
    
class EnhancedGlobalSession:
    def __init__(self):
        # Cross-tool state management
        self.cardgenerator: Optional[CardGeneratorSessionState] = None
        self.storegenerator: Optional[ToolSessionState] = None
        self.ruleslawyer: Optional[ToolSessionState] = None
        self.statblockgenerator: Optional[ToolSessionState] = None
        
        # Global session metadata
        self.user_id: Optional[str] = None
        self.active_world_id: Optional[str] = None
        self.active_project_id: Optional[str] = None
        self.last_accessed: datetime = datetime.now()
        
        # Cross-tool clipboard for object sharing
        self.clipboard: List[str] = []  # Object IDs ready to be shared
        self.recently_viewed: List[str] = []  # Cross-tool recent objects
        
        # Global preferences
        self.preferences: Dict[str, Any] = {
            'default_ai_model': 'gpt-4o',
            'auto_save_interval': 30,  # seconds
            'show_ai_confidence': True,
            'enable_cross_tool_suggestions': True
        }

class GlobalSessionManager:
    """Enhanced session manager with cross-tool object awareness"""
    
    def __init__(self, session_timeout_minutes: int = 60):
        self.sessions: Dict[str, EnhancedGlobalSession] = {}
        self.session_timeout = timedelta(minutes=session_timeout_minutes)
        
    async def update_cardgenerator_state(
        self, 
        session_id: str, 
        state_update: Dict[str, Any]
    ) -> bool:
        """Update CardGenerator state and sync with global objects"""
        session = self.get_session(session_id)
        if not session:
            return False
            
        if not session.cardgenerator:
            session.cardgenerator = CardGeneratorSessionState()
            
        # Update the session state
        for key, value in state_update.items():
            if hasattr(session.cardgenerator, key):
                setattr(session.cardgenerator, key, value)
        
        session.cardgenerator.last_updated = datetime.now()
        
        # If an item is being worked on, ensure it's in recently viewed
        if session.cardgenerator.active_item_id:
            self._add_to_recently_viewed(session, session.cardgenerator.active_item_id)
            
        return True
    
    def _add_to_recently_viewed(self, session: EnhancedGlobalSession, object_id: str):
        """Add object to global recently viewed list"""
        if object_id in session.recently_viewed:
            session.recently_viewed.remove(object_id)
        session.recently_viewed.insert(0, object_id)
        session.recently_viewed = session.recently_viewed[:20]  # Keep last 20
```

### **Frontend Global Session Hook**

```typescript
// LandingPage/src/hooks/useGlobalSession.ts
interface GlobalSessionContextType {
  sessionId: string | null;
  globalState: GlobalSessionState;
  updateToolState: (tool: string, updates: any) => Promise<void>;
  getRecentObjects: (type?: ObjectType) => Promise<DungeonMindObject[]>;
  addToClipboard: (objectId: string) => Promise<void>;
  getClipboard: () => Promise<DungeonMindObject[]>;
  switchWorld: (worldId: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
}

interface GlobalSessionState {
  currentTool: string;
  activeWorldId?: string;
  activeProjectId?: string;
  recentlyViewed: string[];
  clipboard: string[];
  preferences: Record<string, any>;
  
  // Tool-specific states
  cardGenerator?: CardGeneratorSessionState;
  storeGenerator?: any;
  rulesLawyer?: any;
}

export const useGlobalSession = (): GlobalSessionContextType => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [globalState, setGlobalState] = useState<GlobalSessionState>({
    currentTool: 'cardgenerator',
    recentlyViewed: [],
    clipboard: [],
    preferences: {}
  });

  // Initialize or restore session
  useEffect(() => {
    initializeGlobalSession();
  }, []);

  const initializeGlobalSession = async () => {
    try {
      // Try to restore existing session
      const response = await fetch('/api/session/restore', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        const { session_id, state } = await response.json();
        setSessionId(session_id);
        setGlobalState(state);
      } else {
        // Create new session
        const newSessionResponse = await fetch('/api/session/create', {
          method: 'POST',
          credentials: 'include'
        });
        
        const { session_id } = await newSessionResponse.json();
        setSessionId(session_id);
      }
    } catch (error) {
      console.error('Failed to initialize global session:', error);
    }
  };

  const updateToolState = async (tool: string, updates: any) => {
    if (!sessionId) return;
    
    try {
      await fetch(`/api/session/${sessionId}/tools/${tool}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include'
      });
      
      // Update local state
      setGlobalState(prev => ({
        ...prev,
        [tool]: { ...prev[tool as keyof GlobalSessionState], ...updates }
      }));
    } catch (error) {
      console.error(`Failed to update ${tool} state:`, error);
    }
  };

  const getRecentObjects = async (type?: ObjectType): Promise<DungeonMindObject[]> => {
    if (!sessionId) return [];
    
    try {
      const params = type ? `?type=${type}` : '';
      const response = await fetch(`/api/session/${sessionId}/recent-objects${params}`, {
        credentials: 'include'
      });
      
      return response.ok ? await response.json() : [];
    } catch (error) {
      console.error('Failed to get recent objects:', error);
      return [];
    }
  };

  return {
    sessionId,
    globalState,
    updateToolState,
    getRecentObjects,
    addToClipboard: async (objectId: string) => {
      // Implementation for cross-tool object sharing
    },
    getClipboard: async () => {
      // Implementation for cross-tool object access
    },
    switchWorld: async (worldId: string) => {
      await updateToolState('global', { activeWorldId: worldId });
    },
    switchProject: async (projectId: string) => {
      await updateToolState('global', { activeProjectId: projectId });
    }
  };
};
```

---

## 🔌 **CardGenerator Integration Plan**

### **Phase 1: Backend Integration (Week 1)**

```python
# DungeonMindServer/routers/cardgenerator_router.py (Enhanced)
from session_management import session_manager, get_session
from models.dungeonmind_objects import DungeonMindObject, ItemCardData

@router.post("/save-item-object")
async def save_item_as_global_object(
    request: SaveItemRequest,
    session_data = Depends(get_session)
):
    """Save CardGenerator item as a global DungeonMind object"""
    session, session_id = session_data
    
    try:
        # Create DungeonMind object from card data
        dungeonmind_object = DungeonMindObject(
            id=str(uuid.uuid4()),
            type=ObjectType.ITEM,
            createdBy=session.user_id,
            ownedBy=session.user_id,
            worldId=session.active_world_id,
            projectId=session.active_project_id,
            name=request.item_data.name,
            description=request.item_data.description,
            tags=request.tags or [],
            visibility='private',
            sharedWith=[],
            permissions=ObjectPermissions(
                canRead=[session.user_id],
                canWrite=[session.user_id],
                canAdmin=[session.user_id],
                isPublicReadable=False
            ),
            version=1,
            isTemplate=False,
            itemData=request.item_data,
            createdAt=datetime.utcnow().isoformat(),
            updatedAt=datetime.utcnow().isoformat(),
            accessCount=0
        )
        
        # Save to Firestore
        object_id = await save_dungeonmind_object(dungeonmind_object)
        
        # Update session state
        await session_manager.update_cardgenerator_state(session_id, {
            'active_item_id': object_id,
            'recent_items': [object_id] + session.cardgenerator.recent_items[:9]
        })
        
        return {"success": True, "object_id": object_id}
        
    except Exception as e:
        logger.error(f"Failed to save item object: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/session-state")
async def get_cardgenerator_session_state(
    session_data = Depends(get_session)
):
    """Get current CardGenerator session state"""
    session, session_id = session_data
    
    if not session.cardgenerator:
        session.cardgenerator = CardGeneratorSessionState()
    
    return {
        "session_id": session_id,
        "cardgenerator_state": session.cardgenerator.dict(),
        "global_context": {
            "active_world_id": session.active_world_id,
            "active_project_id": session.active_project_id,
            "recently_viewed": session.recently_viewed[:10]
        }
    }

@router.post("/restore-session-state")
async def restore_cardgenerator_session_state(
    request: RestoreSessionRequest,
    session_data = Depends(get_session)
):
    """Restore CardGenerator state from global session"""
    session, session_id = session_data
    
    try:
        # Restore from global session instead of localStorage
        if session.cardgenerator and session.cardgenerator.active_item_id:
            # Load the active item from global objects
            active_object = await get_dungeonmind_object(
                session.cardgenerator.active_item_id
            )
            
            if active_object and active_object.itemData:
                return {
                    "success": True,
                    "item_data": active_object.itemData,
                    "session_state": session.cardgenerator.dict(),
                    "object_id": active_object.id
                }
        
        return {"success": False, "message": "No active session to restore"}
        
    except Exception as e:
        logger.error(f"Failed to restore session state: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### **Phase 2: Frontend Integration (Week 2)**

```typescript
// LandingPage/src/components/CardGenerator/CardGeneratorProvider.tsx
interface CardGeneratorContextType {
  // Global session integration
  globalSession: GlobalSessionContextType;
  currentObject: DungeonMindObject | null;
  
  // Current CardGenerator state
  itemDetails: ItemDetails;
  currentStep: StepId;
  stepCompletion: Record<StepId, boolean>;
  
  // Actions
  saveAsGlobalObject: () => Promise<string>; // Returns object ID
  loadGlobalObject: (objectId: string) => Promise<void>;
  createNewItem: () => void;
  updateItemDetails: (updates: Partial<ItemDetails>) => void;
  
  // Cross-tool features
  getRelatedObjects: () => Promise<DungeonMindObject[]>;
  shareToClipboard: () => Promise<void>;
  loadFromClipboard: (objectId: string) => Promise<void>;
}

export const CardGeneratorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const globalSession = useGlobalSession();
  const [currentObject, setCurrentObject] = useState<DungeonMindObject | null>(null);
  const [itemDetails, setItemDetails] = useState<ItemDetails>(createEmptyItemDetails());
  const [currentStep, setCurrentStep] = useState<StepId>('text-generation');
  
  // Auto-save to global session (replaces localStorage)
  const debouncedSave = useCallback(
    debounce(async () => {
      if (!globalSession.sessionId || !itemDetails.name?.trim()) return;
      
      try {
        // Save current state to global session
        await globalSession.updateToolState('cardGenerator', {
          current_step: currentStep,
          draft_item_data: itemDetails,
          step_completion: calculateStepCompletion(itemDetails),
          last_updated: new Date().toISOString()
        });
        
        // If this is a saved object, update it
        if (currentObject) {
          await updateGlobalObject(currentObject.id, {
            itemData: convertToItemCardData(itemDetails),
            updatedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, 2000),
    [globalSession, currentStep, itemDetails, currentObject]
  );
  
  // Trigger auto-save when state changes
  useEffect(() => {
    debouncedSave();
  }, [debouncedSave, itemDetails, currentStep]);
  
  const saveAsGlobalObject = async (): Promise<string> => {
    if (!globalSession.sessionId) throw new Error('No active session');
    
    try {
      const response = await fetch('/api/cardgenerator/save-item-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_data: convertToItemCardData(itemDetails),
          tags: extractTagsFromItem(itemDetails),
          world_id: globalSession.globalState.activeWorldId,
          project_id: globalSession.globalState.activeProjectId
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to save object');
      }
      
      const { object_id } = await response.json();
      
      // Load the saved object as current object
      await loadGlobalObject(object_id);
      
      return object_id;
    } catch (error) {
      console.error('Failed to save as global object:', error);
      throw error;
    }
  };
  
  const loadGlobalObject = async (objectId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/objects/${objectId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load object');
      }
      
      const object: DungeonMindObject = await response.json();
      
      if (object.type !== ObjectType.ITEM || !object.itemData) {
        throw new Error('Object is not a valid item');
      }
      
      // Update local state from global object
      setCurrentObject(object);
      setItemDetails(convertFromItemCardData(object.itemData));
      setCurrentStep(object.itemData.generationState?.currentStep || 'text-generation');
      
      // Update global session
      await globalSession.updateToolState('cardGenerator', {
        active_item_id: objectId,
        current_step: object.itemData.generationState?.currentStep
      });
      
    } catch (error) {
      console.error('Failed to load global object:', error);
      throw error;
    }
  };
  
  return (
    <CardGeneratorContext.Provider value={{
      globalSession,
      currentObject,
      itemDetails,
      currentStep,
      stepCompletion: calculateStepCompletion(itemDetails),
      saveAsGlobalObject,
      loadGlobalObject,
      createNewItem: () => {
        setCurrentObject(null);
        setItemDetails(createEmptyItemDetails());
        setCurrentStep('text-generation');
      },
      updateItemDetails: (updates) => {
        setItemDetails(prev => ({ ...prev, ...updates }));
      },
      getRelatedObjects: async () => {
        // Find objects with similar tags or in same project/world
        return globalSession.getRecentObjects(ObjectType.ITEM);
      },
      shareToClipboard: async () => {
        if (currentObject) {
          await globalSession.addToClipboard(currentObject.id);
        }
      },
      loadFromClipboard: async (objectId: string) => {
        await loadGlobalObject(objectId);
      }
    }}>
      {children}
    </CardGeneratorContext.Provider>
  );
};
```

### **Phase 3: Migration from localStorage (Week 3)**

```typescript
// LandingPage/src/hooks/useSessionMigration.ts
export const useSessionMigration = () => {
  const globalSession = useGlobalSession();
  
  useEffect(() => {
    migrateFromLocalStorage();
  }, [globalSession.sessionId]);
  
  const migrateFromLocalStorage = async () => {
    if (!globalSession.sessionId) return;
    
    try {
      // Check for existing localStorage data
      const localBackup = localStorage.getItem('cardGenerator_sessionBackup');
      
      if (localBackup) {
        const backup = JSON.parse(localBackup);
        const backupAge = Date.now() - backup.timestamp;
        
        // Only migrate recent backups (< 24 hours)
        if (backupAge < 24 * 60 * 60 * 1000) {
          console.log('Migrating localStorage backup to global session...');
          
          // Save to global session
          await globalSession.updateToolState('cardGenerator', {
            draft_item_data: backup.state.itemDetails,
            current_step: backup.state.currentStep,
            step_completion: backup.state.stepCompletion,
            migrated_from_local: true,
            migration_timestamp: new Date().toISOString()
          });
          
          console.log('Migration completed successfully');
        }
        
        // Clean up localStorage after migration
        localStorage.removeItem('cardGenerator_sessionBackup');
        localStorage.removeItem('cardGenerator_state');
      }
    } catch (error) {
      console.error('Migration failed:', error);
    }
  };
};
```

---

## 🗄️ **Database Schema Implementation**

### **Firestore Collections Structure**

```typescript
// Database collections organization
collections: {
  // Global object storage
  'dungeonmind-objects': {
    [objectId]: DungeonMindObject
  },
  
  // User data and preferences
  'users': {
    [userId]: {
      id: string;
      email: string;
      displayName: string;
      preferences: UserPreferences;
      subscription: SubscriptionInfo;
      createdAt: string;
      lastActive: string;
    }
  },
  
  // World and collaboration
  'worlds': {
    [worldId]: DungeonMindWorld
  },
  
  // Projects for organization
  'projects': {
    [projectId]: DungeonMindProject
  },
  
  // Session state (temporary, with TTL)
  'sessions': {
    [sessionId]: {
      userId: string;
      state: EnhancedGlobalSession;
      expiresAt: Timestamp;
      lastAccessed: Timestamp;
    }
  },
  
  // Analytics and usage tracking
  'analytics': {
    'object-access': {
      [objectId]: {
        totalAccesses: number;
        uniqueUsers: string[];
        lastAccessed: string;
        popularityScore: number;
      }
    },
    'user-activity': {
      [userId]: {
        toolUsage: Record<string, number>;
        objectsCreated: number;
        lastSession: string;
        totalSessions: number;
      }
    }
  }
}
```

### **Database Access Layer**

```python
# DungeonMindServer/database/dungeonmind_objects.py
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from google.cloud import firestore
from models.dungeonmind_objects import DungeonMindObject, ObjectType

class DungeonMindObjectsDB:
    def __init__(self):
        self.db = firestore.Client()
        self.objects_collection = self.db.collection('dungeonmind-objects')
        self.users_collection = self.db.collection('users')
        self.worlds_collection = self.db.collection('worlds')
        
    async def save_object(self, obj: DungeonMindObject) -> str:
        """Save a DungeonMind object to Firestore"""
        try:
            # Validate object schema
            self._validate_object(obj)
            
            # Convert to dictionary for Firestore
            obj_dict = obj.dict()
            
            # Save to Firestore
            doc_ref = self.objects_collection.document(obj.id)
            doc_ref.set(obj_dict)
            
            # Update analytics
            await self._update_analytics(obj.createdBy, 'object_created', obj.type)
            
            return obj.id
            
        except Exception as e:
            logger.error(f"Failed to save object {obj.id}: {e}")
            raise
    
    async def get_object(self, object_id: str, user_id: str) -> Optional[DungeonMindObject]:
        """Retrieve an object with permission checking"""
        try:
            doc = self.objects_collection.document(object_id).get()
            
            if not doc.exists:
                return None
                
            obj_data = doc.to_dict()
            obj = DungeonMindObject(**obj_data)
            
            # Check permissions
            if not self._can_read_object(obj, user_id):
                raise PermissionError(f"User {user_id} cannot read object {object_id}")
            
            # Update access analytics
            await self._update_object_access(object_id, user_id)
            
            return obj
            
        except Exception as e:
            logger.error(f"Failed to get object {object_id}: {e}")
            raise
    
    async def get_user_objects(
        self, 
        user_id: str, 
        object_type: Optional[ObjectType] = None,
        world_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 50
    ) -> List[DungeonMindObject]:
        """Get objects owned by or shared with a user"""
        try:
            query = self.objects_collection.where('ownedBy', '==', user_id)
            
            if object_type:
                query = query.where('type', '==', object_type.value)
            if world_id:
                query = query.where('worldId', '==', world_id)
            if project_id:
                query = query.where('projectId', '==', project_id)
                
            query = query.order_by('updatedAt', direction=firestore.Query.DESCENDING)
            query = query.limit(limit)
            
            docs = query.stream()
            objects = []
            
            for doc in docs:
                try:
                    obj = DungeonMindObject(**doc.to_dict())
                    if self._can_read_object(obj, user_id):
                        objects.append(obj)
                except Exception as e:
                    logger.warning(f"Failed to parse object {doc.id}: {e}")
                    continue
            
            return objects
            
        except Exception as e:
            logger.error(f"Failed to get user objects for {user_id}: {e}")
            raise
    
    async def search_objects(
        self,
        user_id: str,
        query_text: str,
        object_type: Optional[ObjectType] = None,
        world_id: Optional[str] = None,
        limit: int = 20
    ) -> List[DungeonMindObject]:
        """Search objects by name and description"""
        # Note: Firestore doesn't have full-text search, so this is a simple implementation
        # For production, consider using Algolia or Elasticsearch
        
        try:
            base_query = self.objects_collection
            
            # Filter by accessibility
            accessible_query = base_query.where(
                filter=firestore.FieldFilter('ownedBy', '==', user_id)
            ).union(
                base_query.where(
                    filter=firestore.FieldFilter('sharedWith', 'array_contains', user_id)
                )
            ).union(
                base_query.where(
                    filter=firestore.FieldFilter('visibility', '==', 'public')
                )
            )
            
            if object_type:
                accessible_query = accessible_query.where('type', '==', object_type.value)
            if world_id:
                accessible_query = accessible_query.where('worldId', '==', world_id)
            
            docs = accessible_query.limit(limit * 2).stream()  # Get extra to filter by text
            
            # Client-side text filtering (not ideal, but works for MVP)
            results = []
            query_lower = query_text.lower()
            
            for doc in docs:
                try:
                    obj = DungeonMindObject(**doc.to_dict())
                    
                    # Simple text matching
                    if (query_lower in obj.name.lower() or 
                        query_lower in obj.description.lower() or
                        any(query_lower in tag.lower() for tag in obj.tags)):
                        results.append(obj)
                        
                    if len(results) >= limit:
                        break
                        
                except Exception as e:
                    logger.warning(f"Failed to parse search result {doc.id}: {e}")
                    continue
            
            return results
            
        except Exception as e:
            logger.error(f"Failed to search objects: {e}")
            raise
    
    def _can_read_object(self, obj: DungeonMindObject, user_id: str) -> bool:
        """Check if user can read the object"""
        return (
            obj.ownedBy == user_id or
            user_id in obj.sharedWith or
            obj.visibility == 'public' or
            user_id in obj.permissions.canRead
        )
    
    def _validate_object(self, obj: DungeonMindObject):
        """Validate object before saving"""
        if not obj.name.strip():
            raise ValueError("Object name cannot be empty")
            
        if not obj.createdBy:
            raise ValueError("Object must have a creator")
            
        # Validate tool-specific data
        tool_data_count = sum([
            bool(obj.itemData),
            bool(obj.storeData),
            bool(obj.statblockData),
            bool(obj.ruleData),
            bool(obj.spellData)
        ])
        
        if tool_data_count != 1:
            raise ValueError("Object must have exactly one tool-specific data field")
```

---

## 🚀 **Implementation Timeline**

### **Week 1: Foundation**
- [ ] Implement global object schema in Firestore
- [ ] Enhance GlobalSessionManager with CardGenerator support
- [ ] Create database access layer for DungeonMind objects
- [ ] Add session state endpoints to backend

### **Week 2: Integration**
- [ ] Create useGlobalSession hook
- [ ] Build CardGeneratorProvider with global session integration
- [ ] Implement save/load functionality for global objects
- [ ] Add session migration from localStorage

### **Week 3: Testing & Polish**
- [ ] Comprehensive testing of global session flow
- [ ] Performance optimization for object queries
- [ ] Error handling and fallback strategies
- [ ] Cross-tool object sharing implementation

### **Week 4: Launch Preparation**
- [ ] Final CardGenerator UI improvements
- [ ] Documentation and deployment guides
- [ ] Monitoring and analytics setup
- [ ] Beta testing and bug fixes

---

## 🎯 **Success Metrics**

### **Technical Metrics**
- [ ] Session state persists across browser refreshes
- [ ] Objects saved in CardGenerator accessible from other tools
- [ ] Session state sync < 100ms latency
- [ ] Zero data loss during migrations

### **User Experience Metrics**
- [ ] Seamless cross-tool workflow
- [ ] Clear object organization and discovery
- [ ] Intuitive sharing and collaboration features
- [ ] Fast load times for recent objects (<500ms)

### **Business Metrics**
- [ ] Foundation ready for additional tools
- [ ] Scalable architecture for multi-user worlds
- [ ] Clear path to premium collaboration features
- [ ] Analytics for user engagement tracking

---

## 🔄 **Future Expansion Hooks**

### **Ready for StoreGenerator Integration**
```typescript
// The schema supports store objects out of the box
interface StoreData {
  shopName: string;
  shopType: string;
  inventory: InventoryItem[];
  npcs: NPCData[];
  layout: ShopLayout;
  // ... store-specific data
}

// StoreGenerator can use the same patterns:
const { saveAsGlobalObject, loadGlobalObject } = useGlobalSession();
await saveAsGlobalObject(storeData, ObjectType.STORE);
```

### **Cross-Tool Object References**
```typescript
// Items can reference stores they're sold in
interface ItemCardData {
  // ... existing fields
  availableAt?: string[];  // Store object IDs
  relatedItems?: string[]; // Other item object IDs
  partOfSet?: string;      // Set/collection object ID
}
```

### **Collaboration Features**
```typescript
// Real-time collaborative editing
interface ObjectVersion {
  // ... existing fields
  collaborators: CollaboratorInfo[];
  changeLog: ChangeLogEntry[];
  conflictResolution: ConflictData[];
}
```

This implementation plan provides the foundation for DungeonMind's cross-tool vision while getting CardGenerator launch-ready with proper architecture. Each phase builds incrementally, reducing risk while maximizing strategic value. 