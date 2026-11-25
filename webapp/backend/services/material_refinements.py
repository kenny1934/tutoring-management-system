"""Structured search options shared by the CSM bridge and search engine."""
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SearchRefinement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    match: Literal["all", "any"] = "all"
    any_words: str = Field(default="", max_length=256)
    exclude_words: str = Field(default="", max_length=256)
    exact_phrase: str = Field(default="", max_length=256)
    search_in: Literal["both", "filename", "content"] = "both"
    modified_from: date | None = None
    modified_to: date | None = None

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.modified_from and self.modified_to and self.modified_from > self.modified_to:
            raise ValueError("The start date must be on or before the end date.")
        return self
