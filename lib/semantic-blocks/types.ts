export interface SemanticBlock {
  id: string;
  name: string;
  category: 'Sections' | 'Content' | 'Interactive' | 'Data';
  description: string;
  wireframeHtml: string;
}

export interface PlacedBlock {
  blockId: string;
  placementId: string;
  domPath: string;
  position: 'before' | 'after';
  page: string;
  htmlContext: string;
}
