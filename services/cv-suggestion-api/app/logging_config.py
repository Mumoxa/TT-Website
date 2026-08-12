import json, logging
logger=logging.getLogger('cv_suggestion_api')
handler=logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(message)s'))
logger.handlers=[handler]; logger.setLevel(logging.INFO); logger.propagate=False
_ALLOWED={'request_id','task','fragment_count','character_count','status_code','duration_ms','error_code'}
def log_metadata(**fields): logger.info(json.dumps({key:fields[key] for key in _ALLOWED if key in fields},separators=(',',':')))
