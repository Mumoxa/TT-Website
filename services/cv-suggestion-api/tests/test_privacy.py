import logging
from app.logging_config import log_metadata
def test_metadata_logger_drops_candidate_content(capfd):
 log_metadata(request_id='r',task='refine_bullet',fragment_count=1,character_count=29,status_code=503,error_code='outage',candidate='PRIVATE-CANDIDATE-MARKER-7391',prompt='PRIVATE-CANDIDATE-MARKER-7391')
 assert 'PRIVATE-CANDIDATE-MARKER-7391' not in capfd.readouterr().err
