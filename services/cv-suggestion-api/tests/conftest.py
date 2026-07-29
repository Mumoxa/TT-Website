import pytest
from app.config import Settings
from app.main import create_app
class FakeOllama:
 async def suggest(self,request):
  from app.models import SuggestionResponse
  return SuggestionResponse.model_validate({'task':request.task,'suggestions':[]})
@pytest.fixture
def settings(): return Settings(cv_relay_token='0123456789abcdef',ollama_model='test-model')
@pytest.fixture
def app(settings): return create_app(settings,FakeOllama())
