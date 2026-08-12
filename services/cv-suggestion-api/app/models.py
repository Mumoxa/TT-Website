from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
Task = Literal['classify_notes','refine_bullet','review_dates','flag_duplicates','refine_existing_summary']
Confidence = Literal['high','medium','low']
class StrictModel(BaseModel): model_config=ConfigDict(extra='forbid')
class Fragment(StrictModel):
    id: Annotated[str, Field(min_length=1,max_length=120)]
    text: Annotated[str, Field(min_length=1,max_length=4000)]
class SuggestionRequest(StrictModel):
    task: Task
    fragments: Annotated[list[Fragment],Field(min_length=1,max_length=8)]
    context: Annotated[str|None,Field(max_length=1000)]=None
    @model_validator(mode='after')
    def boundaries(self):
        if len({f.id for f in self.fragments}) != len(self.fragments): raise ValueError('fragment IDs must be unique')
        if sum(len(f.text) for f in self.fragments)+len(self.context or '') > 12000: raise ValueError('total too large')
        return self
class BaseSuggestion(StrictModel):
    fragmentId: Annotated[str,Field(min_length=1,max_length=120)]
    reason: Annotated[str,Field(min_length=1,max_length=500)]
    confidence: Confidence
    warnings: Annotated[list[Annotated[str,Field(max_length=300)]],Field(max_length=5)]
class ClassifySuggestion(BaseSuggestion):
    destination: Literal['contact','summary','employment','education','qualifications','skills','additional','unclassified']
    proposedText: Annotated[str|None,Field(min_length=1,max_length=4000)]=None
class WordingSuggestion(BaseSuggestion): proposedText: Annotated[str,Field(min_length=1,max_length=4000)]
class DateSuggestion(BaseSuggestion): flags: Annotated[list[Annotated[str,Field(min_length=1,max_length=300)]],Field(min_length=1,max_length=5)]
class DuplicateSuggestion(BaseSuggestion): duplicateFragmentIds: Annotated[list[Annotated[str,Field(min_length=1,max_length=120)]],Field(min_length=1,max_length=7)]
class SuggestionResponse(StrictModel):
    task: Task
    suggestions: Annotated[list[ClassifySuggestion|WordingSuggestion|DateSuggestion|DuplicateSuggestion],Field(max_length=8)]
    @model_validator(mode='after')
    def task_shape(self):
        expected = {'classify_notes': ClassifySuggestion, 'refine_bullet': WordingSuggestion,
                    'refine_existing_summary': WordingSuggestion, 'review_dates': DateSuggestion,
                    'flag_duplicates': DuplicateSuggestion}[self.task]
        if any(not isinstance(item, expected) for item in self.suggestions):
            raise ValueError('suggestion shape does not match task')
        return self
